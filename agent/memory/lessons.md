# Lessons Learned

## Development Patterns

### API Development

- Always test API endpoints with curl before implementing UI
- Use proper error handling and status codes
- Implement authentication middleware correctly
- Separate public and protected routes clearly

### UI Development

- Use consistent page structure with UDashboardPanel and UDashboardNavbar
- Implement proper loading states and error handling
- Use toast notifications for API interactions, inline validation for forms
- Follow established patterns for navigation and user interaction

### Testing

- Run tests before committing changes
- Use proper test environment setup
- Test both API and UI functionality

### Git Workflow

- Commit frequently with clear messages
- Use feature branches for major changes
- Test thoroughly before merging

## Critical Issues Resolved

### Infinite Loop in Vue Reactivity System

**Issue**: `RangeError: Maximum call stack size exceeded` in UI, specifically in
`@nuxt/ui` Icon component **Root Cause**: Reactive dependency loop between
custom composables (`useIcons`, `Icon.vue`) and `@nuxt/ui`'s Icon component
**Solution**: Reverted to stable commit before the problematic changes were
introduced **Lesson**: When creating custom icon systems or composables that
interact with UI components, be extremely careful about reactive dependencies.
The `@nuxt/ui` Icon component has complex internal reactivity that can easily
create circular dependencies.

### API Port Conflicts

**Issue**: Multiple API instances running on same port **Solution**: Use
`lsof -ti:3000` to find processes and `kill -9` to terminate them **Lesson**:
Always check for running processes before starting servers

### Authentication Middleware

**Issue**: Config endpoints requiring authentication when they should be public
**Solution**: Apply `authMiddleware` only to specific protected routes, not
globally **Lesson**: Be explicit about which routes need authentication vs which
should be public

## Best Practices

### Composable Development

- Avoid circular dependencies between composables
- Be careful when creating wrappers around UI components
- Test composables in isolation before integrating

### Error Handling

- Use proper try-catch blocks
- Implement meaningful error messages
- Separate client-side validation from server-side errors

### Code Organization

- Keep related functionality together
- Use consistent naming conventions
- Document complex logic

## Current State

- User management interface is working
- API is stable and running
- UI infinite loop issue is resolved
- Ready to proceed with next milestone: Record Creation/Editing Interface
