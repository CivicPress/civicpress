# Lessons Learned

## Record Management Interface Architecture

### Component Reusability Patterns 🧩

- **DRY Principle**: Created `RecordSearch.vue` and `RecordList.vue` for reuse
  across pages
- **Props Interface**: Well-defined props with TypeScript interfaces for type
  safety
- **Event Communication**: Used emits for parent-child communication (`@search`,
  `@filter-change`)
- **Conditional Rendering**: `v-if="!disableTypeFilter"` for context-aware UI
  elements

### API Integration Best Practices 📡

- **Smart Query Handling**: Empty searches use `loadInitialRecords`, non-empty
  use `searchRecords`
- **Validation**: Added store-level validation to prevent empty queries from
  reaching API
- **Error Prevention**: Check for empty queries before calling search endpoints
- **Fallback Logic**: Graceful degradation when API calls fail

### URL State Management 🔗

- **Query Parameters**: Maintain search and filter state in URL for bookmarking
- **State Restoration**: `restoreFromURL()` function to rebuild state from URL
- **Navigation**: Use `navigateTo({ query }, { replace: true })` for clean URLs
- **Breadcrumb Integration**: Dynamic breadcrumbs that reflect current state

### Type-Specific Page Patterns 🎯

- **Pre-Selection**: Automatically filter by record type on `/records/[type]`
  pages
- **Disabled Filters**: Hide type filter when type is pre-selected for cleaner
  UX
- **Context Awareness**: Show "Showing all bylaw records" instead of generic
  text
- **Navigation Hierarchy**: Proper breadcrumb structure (Records → Type →
  Record)

### Performance Optimizations ⚡

- **Virtual Scrolling**: For datasets > 50 records to maintain performance
- **Skeleton Loading**: Better perceived performance than spinners
- **Debounced Search**: 300ms delay to prevent excessive API calls
- **Lazy Loading**: Load more records on demand with cursor-based pagination

### UX/UI Consistency Standards 🎨

- **UDashboardPanel Pattern**: Consistent header and body structure across pages
- **Skeleton Components**: Reusable skeleton components for loading states
- **Toast Notifications**: API feedback for user actions
- **Breadcrumb Navigation**: 3-level hierarchy for proper navigation context

## Raw Record View Implementation

### File System vs Database Content 📄

- **Raw Content Requirement**: Users need complete markdown files including YAML
  frontmatter
- **API Endpoint Design**: Created `/api/records/:id/raw` for raw file content
- **File System Access**: Use `fs.readFileSync()` to read complete files from
  disk
- **Fallback Strategy**: Return database content if file read fails
- **Path Construction**: Proper path joining for cross-platform compatibility

### Clipboard API Best Practices 📋

- **HTTPS Requirement**: Modern clipboard API requires secure context
- **Production-First**: Design for production (HTTPS) rather than development
  (HTTP)
- **User Experience**: Clear error messages when clipboard operations fail
- **Manual Fallback**: Guide users to manual copy (Ctrl+C / Cmd+C) when needed
- **Clean Implementation**: Avoid hacky workarounds, use standard APIs

### Navigation Integration 🧭

- **UNavigationMenu Usage**: Proper implementation with computed items array
- **Button Placement**: Strategic placement of "View Raw" button in record view
- **Access Control**: Allow all users (including guests) to view raw content
- **Consistent UX**: Follow existing UI patterns for navigation elements

### Auto-Indexing Optimization 🔄

- **Startup Performance**: Made auto-indexing optional to prevent Git lock
  conflicts
- **Environment Control**: Use `ENABLE_AUTO_INDEXING=true` for development
- **Error Prevention**: Avoid `.git/index.lock` conflicts during concurrent
  operations
- **CLI Alternative**: Separate `civic auto-index` command for manual indexing

## Common Issues & Solutions

### API Error Prevention 🛡️

- **Empty Query Errors**: Validate queries before sending to API
- **400 Bad Request**: Check for required parameters before API calls
- **Fallback Strategy**: Use `loadInitialRecords` when search fails
- **Error Boundaries**: Graceful error handling with user-friendly messages

### Component Communication 🔄

- **Event Emits**: Use typed emits for parent-child communication
- **Props Validation**: TypeScript interfaces for prop validation
- **Reactive Updates**: Watch for prop changes and emit events accordingly
- **State Synchronization**: Keep parent and child state in sync

### URL State Management 🔧

- **Query Parameter Handling**: Proper encoding/decoding of URL parameters
- **State Restoration**: Rebuild component state from URL on page load
- **Navigation Updates**: Update URL when filters change
- **Browser History**: Preserve navigation history with proper state management

### Type-Specific Page UX 🎯

- **Filter Disabling**: Hide irrelevant filters when type is pre-selected
- **Context Labels**: Show appropriate labels based on current context
- **Navigation Flow**: Clear breadcrumb hierarchy for user orientation
- **State Persistence**: Maintain filter state across navigation

### Vue Template Debugging 🔧

- **v-if/v-else-if/v-else Chain**: Ensure proper conditional rendering structure
- **Component Props**: Pass computed properties correctly to components
- **Missing Elements**: Check for proper opening/closing tags
- **Script Variables**: Define all variables and functions used in template

### Git Operations & Concurrency 🔄

- **Lock File Conflicts**: `.git/index.lock` errors during concurrent operations
- **Auto-Indexing Timing**: Avoid Git operations during API startup
- **Environment Variables**: Use flags to control optional startup processes
- **Error Handling**: Graceful fallback when Git operations fail

## Performance Considerations

### Virtual Scrolling Implementation 📊

- **Threshold**: Enable virtual scrolling for lists > 50 items
- **Item Height**: Fixed height (120px) for consistent rendering
- **Performance Indicator**: Show when virtual scrolling is active
- **Memory Management**: Only render visible items to reduce DOM size

### Skeleton Loading Strategy 💀

- **Immediate Display**: Show skeletons immediately when loading starts
- **Consistent Patterns**: Use same skeleton structure as actual content
- **Loading States**: Different skeletons for different content types
- **API Delay Testing**: Configurable delays for testing loading states

### Search Optimization 🔍

- **Debouncing**: 300ms delay to prevent excessive API calls
- **Query Validation**: Check for empty queries before API calls
- **Fallback Logic**: Use appropriate endpoints based on query content
- **Caching**: Leverage existing data when possible

## Security Best Practices

### Input Validation 🛡️

- **Client-Side**: Validate inputs before sending to API
- **Server-Side**: API validation for all endpoints
- **Type Safety**: TypeScript interfaces for all data structures
- **Error Handling**: Graceful error handling without exposing internals

### Authentication & Authorization 🔐

- **Role-Based Access**: Different permissions for different user roles
- **Public vs Protected**: Clear distinction between public and protected
  endpoints
- **Token Management**: Proper JWT token handling and validation
- **Session Security**: Secure session management and timeout handling

## Future Considerations

### Scalability Planning 📈

- **Component Architecture**: Reusable components for easy scaling
- **API Design**: RESTful endpoints with proper pagination
- **Performance Monitoring**: Track loading times and user experience
- **Caching Strategy**: Implement caching for frequently accessed data

### Maintainability Standards 🛠️

- **Code Organization**: Clear separation of concerns
- **Documentation**: Comprehensive documentation for all components
- **Testing Strategy**: Unit tests for components and utilities
- **Error Handling**: Consistent error handling patterns

### User Experience Evolution 🚀

- **Feedback Loops**: User feedback for continuous improvement
- **Accessibility**: WCAG compliance for inclusive design
- **Mobile Optimization**: Responsive design for all screen sizes
- **Performance Monitoring**: Track and optimize user experience metrics
