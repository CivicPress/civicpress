# User Registration and Management

## Overview

CivicPress provides a comprehensive user management system with role-based
access control, allowing administrators to create, edit, and manage user
accounts through both the API and web interface.

## Admin User Management

### UI Navigation

- Navigate to **Settings** → **Users** from the main sidebar
- Available for users with `admin` or `clerk` roles
- Provides full CRUD operations for user management

### Features

- **User Listing**: View all users with their roles and basic information
- **User Creation**: Add new users with role assignment and password generation
- **User Editing**: Modify user details, roles, and passwords
- **User Deletion**: Remove users with confirmation modal
- **Role Management**: Dynamic role selection from system configuration
- **Password Management**: Generate strong passwords, change passwords, and
  password strength indicators

### Form Features

- **Inline Validation**: Form errors displayed within the form fields
- **API Feedback**: Toast notifications for API interaction success/errors
- **Password Strength**: Visual indicator for password strength
- **Generate Password**: Automatic strong password generation
- **Show/Hide Password**: Toggle password visibility
- **Security**: Password fields cleared after submission

## Role System

### Available Roles

- **Admin**: Full system access, can manage users and all records
- **Council**: Can view and edit records, limited administrative access
- **Clerk**: Can create/edit records and manage users
- **Public**: Read-only access to public records

### Role Permissions

Roles are defined in `data/.civic/roles.yml` and include:

- `records:create`, `records:edit`, `records:view`, `records:list`
- `users:view`, `users:edit`, `users:create`, `users:delete`
- `templates:view`, `workflows:manage`

## API Endpoints

### User Management

- `GET /api/users` - List all users (admin/clerk only)
- `GET /api/users/:id` - Get specific user details
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Configuration

- `GET /api/config/roles` - Get available roles (public)
- `GET /api/config/record-types` - Get record types (public)
- `GET /api/config/record-statuses` - Get record statuses (public)

## Loading System

### Skeleton Components

The UI includes comprehensive skeleton loading components for improved user
experience:

- **UserCardSkeleton**: For user lists and user cards
- **RecordCardSkeleton**: For record lists and record cards
- **FormSkeleton**: For forms and input fields
- **AvatarSkeleton**: For user avatars and profile pictures
- **DashboardCardSkeleton**: For dashboard cards and quick actions

### Loading States

- **Skeleton Loading**: Shows skeleton components during API calls
- **Form Loading**: Loading states for form submissions
- **Navigation Loading**: Smooth transitions between pages
- **API Delay Testing**: Development mode includes configurable API delays for
  testing loading states

### Implementation

- **useLoading Composable**: Centralized loading state management
- **Delay Middleware**: Configurable API delays for development testing
- **Hot Reload**: UI updates automatically without server restart
- **Consistent UX**: All pages follow standardized loading patterns

## Authentication

### Login Process

1. User enters credentials on login page
2. System validates against stored user data
3. JWT token generated and stored in session
4. User redirected to dashboard with role-based access

### Session Management

- Tokens stored in localStorage for persistence
- Automatic token validation on app initialization
- Session expiration handling
- Secure logout with token cleanup

### Security Features

- Password strength requirements
- Role-based access control
- API endpoint protection
- Session token validation
- Secure password handling (cleared after submission)

## Development Features

### Testing Loading States

- **API Delay**: Set `API_DELAY=true` and `API_DELAY_MS=3000` for 3-second
  delays
- **Skeleton Testing**: Visit pages during API delays to see skeleton components
- **Hot Reload**: UI changes apply immediately without restart
- **Development Mode**: Enhanced logging and debugging features

### Environment Variables

```bash
# Enable API delays for testing loading states
API_DELAY=true
API_DELAY_MS=3000

# Development mode
NODE_ENV=development
```

## Best Practices

### User Management

- Always assign appropriate roles to new users
- Use strong passwords and enable password generation
- Regularly review and update user permissions
- Monitor user activity and session management

### Loading UX

- Skeleton components provide better perceived performance
- Inline validation keeps users informed of form errors
- Toast notifications provide clear API feedback
- Consistent loading patterns across all pages

### Security

- Clear password fields after form submission
- Validate user permissions before operations
- Use HTTPS in production environments
- Implement proper session management
