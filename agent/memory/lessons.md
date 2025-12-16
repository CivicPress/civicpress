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
- **Pagination**: Server-side page-based pagination with URL state management
  (cursor-based removed)

### Record Editor UI Patterns 📝

- **Simplified Button System**: Single split-button with contextual dropdown
  reduces cognitive load
- **State-Aware Actions**: Menu items filtered based on current record status
  and allowed transitions
- **Confirmation Modals**: Important actions (publish, unpublish, archive,
  delete) require confirmation
- **Flat Document Design**: Removed card wrappers for clean, document-focused
  interface
- **Word Wrap**: CodeMirror `EditorView.lineWrapping` prevents horizontal
  scrollbars
- **Reactive Counts**: Accordion item counts update automatically when items are
  added/removed
- **Component Lifecycle**: Use `getCurrentInstance()` check before calling
  lifecycle hooks in composables
- **Dropdown Menu Structure**: UDropdownMenu expects array-of-arrays format for
  sections
- **Status Management**: Status dropdown uses same pattern as type dropdown for
  consistency

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

## Logo & Branding Implementation

### Configurable Logo System 🎨

- **Organization Config**: Use `.system-data/.civic/org-config.yml` for branding
- **API Static Serving**: Serve brand assets via `/brand-assets` endpoint
- **Path Resolution**: Convert relative paths to API endpoints
  (`brand-assets/logo.svg` → `/brand-assets/logo.svg`)
- **Fallback Strategy**: Default to `/logo.svg` if config logo not available
- **Theme Compatibility**: Use `dark:invert` CSS for automatic light/dark theme
  switching

### Logo Design Best Practices 🖼️

- **Transparent Background**: Remove colored backgrounds for better UI
  integration
- **Monochrome Design**: Use black geometric elements that invert to white in
  dark theme
- **Scalable Sizing**: Multiple size options (`sm`, `md`, `lg`, `xl`, `2xl`) for
  different contexts
- **Consistent Branding**: Always show "CivicPress" text regardless of
  organization config
- **SVG Format**: Vector graphics for crisp display at any size

### Component Architecture 🧩

- **Smart Logo Component**: Fetches organization config via `/info` API
- **Theme Awareness**: Automatic dark/light theme adaptation
- **Responsive Sizing**: Context-aware sizing (sidebar vs home page)
- **Organization Name**: Configurable organization name for other UI elements
- **Error Handling**: Graceful fallbacks when API calls fail

### Home Page Branding 🏠

- **Prominent Logo**: Use `2xl` size (96px) for home page hero section
- **Centered Layout**: Proper spacing and centering for maximum impact
- **Consistent Title**: Always show "CivicPress" as brand name
- **Organization Info**: Show organization details in separate section
- **Responsive Design**: Logo scales appropriately on different screen sizes

### Virtual Scrolling Issues 🔄

- **Library Compatibility**: `useVirtualList` from `@vueuse/core` may not work
  with all data structures
- **Reactive Data**: Virtual lists need proper reactive data binding
- **Alternative Solutions**: Use pagination when virtual scrolling fails
- **Performance**: 50 records per page provides good balance of performance and
  UX
- **Scroll-to-Top**: Implement smooth scrolling to breadcrumbs for better
  navigation

### Username-Based Routing Security 🔐

- **Security Improvement**: Use usernames instead of numeric IDs in URLs
- **API Compatibility**: Support both username and ID lookups in backend
- **Fallback Logic**: Try username first, then fall back to ID if numeric
- **URL Structure**: `/settings/users/username/` instead of
  `/settings/users/123/`
- **Frontend Integration**: Update navigation functions to use username-based
  paths

### Home Page UX Improvements 🏠

- **Role-Based Cards**: Show different cards based on user role (admin, user,
  guest)
- **Quick Actions**: Browse Records, Create Record, Sign In, Settings (admin),
  Profile (user)
- **Grid Layout**: Responsive grid with `xl:grid-cols-4` for large screens
- **Clean Design**: Remove empty sections (System Overview) for better focus
- **Public Records**: Show recent records to all users (including
  non-authenticated) for transparency

### Responsive Header Actions 🎯

- **Unified Component**: HeaderActions component for consistent responsive
  behavior
- **Desktop**: Side-by-side buttons for larger screens
- **Mobile**: Vertical 3-dot dropdown menu for smaller screens
- **Flexible Actions**: Support for navigation, functions, conditional display,
  and styling
- **Permission-Aware**: Conditional actions based on user roles and permissions
- **Type Safety**: Full TypeScript support with proper interfaces

### Security & Access Control 🔐

- **Admin-Only Pages**: Settings page restricted to admin users with automatic
  redirect
- **Role-Based UI**: Different actions and content based on user permissions
- **Graceful Handling**: Clear error messages and smooth redirects for
  unauthorized access
- **Client-Side Protection**: Immediate feedback and prevention of unauthorized
  access
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
