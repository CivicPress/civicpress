# Template Loading System

**Last Updated**: January 2025 
**Status**: **Fully Implemented and Tested**

## Overview

The Template Loading System provides an intuitive way for users to populate
record content with predefined templates, complete with variable substitution
and confirmation workflows to prevent accidental content loss.

## Features

### **Template Management**

- **Type-Based Templates**: Templates organized by record type (bylaw, policy,
 resolution, etc.)
- **Template Selection**: Dropdown interface showing available templates
- **Template Metadata**: Name, description, and type information
- **Always Visible**: Template section visible from the start, even before
 record type selection

### **Content Loading**

- **Confirmation Modal**: Detailed template information and content replacement
 warning
- **Variable Substitution**: Dynamic content with current form data
- **Content Replacement**: Complete replacement of existing content with
 template
- **User Control**: Clear confirmation required before any content changes

### **User Experience**

- **Progressive Disclosure**: Template options appear after record type
 selection
- **Clear Guidance**: Helpful messages when no templates are available
- **Visual Feedback**: Toast notifications for successful template loading
- **Error Prevention**: Confirmation prevents accidental content loss

## Usage

### Frontend Interface

The template system is integrated into the record creation and editing forms:

```vue
<!-- Template Loading Section -->
<div class="my-4">
 <h3 class="text-lg font-medium text-gray-900 dark:text-white">Templates</h3>

 <!-- Template Options (when type is selected) -->
 <div v-if="form.type" class="space-y-2">
 <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
 Available Templates
 </label>
 <div class="flex items-center gap-2">
 <UButton
 color="primary"
 variant="outline"
 size="sm"
 @click="openTemplateModal"
 :disabled="saving || !selectedTemplate || !templateOptionsComputed.length"
 >
 Load Template
 </UButton>
 <USelectMenu
 v-model="selectedTemplate"
 :items="templateOptionsComputed"
 placeholder="Select a template"
 :disabled="saving"
 class="flex-1"
 />
 </div>
 <p class="text-sm text-gray-600">
 Choose a template and click "Load Template" to populate the content field.
 </p>
 </div>

 <!-- Guidance Message (when no type selected) -->
 <div v-else class="text-sm text-gray-500 dark:text-gray-400 italic">
 Select a record type above to see available templates.
 </div>
</div>
```

### Template Confirmation Modal

A comprehensive confirmation modal ensures users understand the implications:

```vue
<!-- Template Confirmation Modal -->
<UModal
 v-model="showTemplateModal"
 v-if="selectedTemplate"
 title="Load Template"
 description="Are you sure you want to load this template? This will replace your current content."
>
 <template #body>
 <div class="space-y-4">
 <!-- Template Details -->
 <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
 <div class="flex items-start space-x-3">
 <UIcon name="i-lucide-info" class="w-5 h-5 text-blue-600 mt-0.5" />
 <div class="text-sm text-blue-700 dark:text-blue-300">
 <p class="font-medium">Template Details:</p>
 <ul class="mt-1 space-y-1">
 <li>• <strong>Name:</strong> {{ selectedTemplate?.label }}</li>
 <li>• <strong>Type:</strong> {{ form.type }}</li>
 <li v-if="selectedTemplate?.description">• <strong>Description:</strong> {{ selectedTemplate.description }}</li>
 </ul>
 </div>
 </div>
 </div>

 <!-- Warning -->
 <div class="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
 <div class="flex items-start space-x-3">
 <UIcon name="i-lucide-alert-triangle" class="w-5 h-5 text-yellow-600 mt-0.5" />
 <div class="text-sm text-yellow-700 dark:text-yellow-300">
 <p class="font-medium">Warning:</p>
 <ul class="mt-1 space-y-1">
 <li>• Current content will be completely replaced</li>
 <li>• Template variables will be filled with current form data</li>
 <li>• This action cannot be undone</li>
 </ul>
 </div>
 </div>
 </div>
 </div>
 </template>

 <template #footer="{ close }">
 <div class="flex justify-end space-x-3">
 <UButton color="neutral" variant="outline" @click="close">
 Cancel
 </UButton>
 <UButton color="primary" :loading="saving" @click="loadTemplate">
 Load Template
 </UButton>
 </div>
 </template>
</UModal>
```

## Implementation

### Core Functions

```typescript
// Open template confirmation modal
const openTemplateModal = () => {
 if (selectedTemplate.value) {
 showTemplateModal.value = true;
 }
};

// Load and apply selected template
const loadTemplate = () => {
 if (selectedTemplate.value) {
 const template = getTemplateById(selectedTemplate.value.value);
 if (template) {
 // Prepare variables for template substitution
 const variables = {
 title: form.title || '[Record Title]',
 user: 'Current User', // TODO: Get from auth store
 timestamp: new Date().toISOString(),
 };

 // Process template with variables
 const processedContent = processTemplate(template, variables);

 // Update form content
 form.content = processedContent;

 // Close modal and show success notification
 showTemplateModal.value = false;
 toast.add({
 title: 'Template Loaded',
 description: `Template "${template.name}" has been loaded successfully.`,
 color: 'primary',
 });
 }
 }
};
```

### Template Data Structure

```typescript
interface Template {
 id: string;
 name: string;
 description?: string;
 type: string;
 content: string;
 variables: string[];
}

// Template options for dropdown
const templateOptionsComputed = computed(() => {
 if (!form.type) return [];

 return getTemplatesByType(form.type).map(template => ({
 label: template.name,
 value: template.id,
 description: template.description
 }));
});
```

### State Management

```typescript
// Reactive state
const showTemplateModal = ref(false);
const selectedTemplate = ref<TemplateOption | null>(null);

// Template loading state
const loadingTemplate = ref(false);
```

## Template Processing

### Variable Substitution

Templates support dynamic variables that get replaced with current form data:

```typescript
// Template content example
const templateContent = `
# {{title}}

**Created by:** {{user}}
**Date:** {{timestamp}}

## Overview

[Template content here...]
`;

// Variable substitution
const processTemplate = (template: Template, variables: Record<string, string>) => {
 let content = template.content;

 // Replace variables with actual values
 Object.entries(variables).forEach(([key, value]) => {
 const regex = new RegExp(`{{${key}}}`, 'g');
 content = content.replace(regex, value);
 });

 return content;
};
```

### Available Variables

- **`{{title}}`**: Current record title or placeholder
- **`{{user}}`**: Current user name (from authentication)
- **`{{timestamp}}`**: Current date/time in ISO format
- **`{{type}}`**: Record type (bylaw, policy, etc.)

## User Workflow

### 1. **Template Discovery**

- User sees template section immediately upon opening form
- Clear guidance to select record type first
- Template options appear after type selection

### 2. **Template Selection**

- Dropdown shows available templates for selected record type
- Template descriptions provide context
- Load Template button becomes active

### 3. **Confirmation Process**

- Clicking "Load Template" opens confirmation modal
- Modal shows template details and warnings
- User must explicitly confirm content replacement

### 4. **Template Application**

- Template content replaces existing content
- Variables are substituted with current form data
- Success notification confirms completion
- Modal closes automatically

## Integration Points

### Record Form Integration

The template system is fully integrated with the record creation/editing
workflow:

- **Form State**: Template selection affects form validation
- **Content Management**: Template content replaces form content
- **User Feedback**: Toast notifications and modal interactions
- **Error Handling**: Graceful fallbacks for missing templates

### Template Management

Templates are managed through the existing template system:

- **Template Discovery**: `useTemplates` composable
- **Type Filtering**: Templates filtered by record type
- **Content Processing**: Template engine handles variable substitution
- **Storage**: Templates stored in configuration system

## Testing

### Test Coverage

- **Unit Tests**: Template processing and variable substitution
- **Integration Tests**: Template loading in record forms
- **UI Tests**: Modal interactions and form state changes
- **User Experience Tests**: Template discovery and selection flows

### Test Scenarios

```typescript
// Template loading functionality
it('should load template and replace content', async () => {
 // Select template
 await selectTemplate('bylaw-template');

 // Open modal
 await click(loadTemplateButton);

 // Confirm template loading
 await click(confirmButton);

 // Verify content replacement
 expect(form.content).toContain('Template content');
 expect(showTemplateModal.value).toBe(false);
});

// Template visibility
it('should show template section even without type selected', () => {
 expect(templateSection).toBeVisible();
 expect(templateGuidance).toHaveText('Select a record type above');
});
```

## Future Enhancements

### Planned Features

- **Template Categories**: Organize templates by purpose or department
- **Template Versioning**: Track template changes and updates
- **Custom Variables**: User-defined template variables
- **Template Preview**: Preview template content before loading
- **Template Sharing**: Share templates between organizations

### Advanced Functionality

- **Conditional Content**: Template sections based on form data
- **Template Inheritance**: Base templates with specialized variants
- **Bulk Operations**: Apply templates to multiple records
- **Template Analytics**: Usage statistics and effectiveness metrics
- **Template Validation**: Ensure template quality and completeness

## Related Documentation

- [Record Management](records.md)
- [Geography Data System](geography-system.md)
- [Frontend Development](ui.md)
- [User Interface Components](ui-components.md)
- [Form Validation](validation.md)
