# 🛡️ Error Handling Guide

CivicPress implements a comprehensive error handling system that provides consistent user experience and maintainable code.

## 🎯 Overview

The error handling system consists of:

- **`useErrorHandler` Composable**: Centralized error handling with specialized handlers
- **API Interceptor**: Automatic error handling in the `civicApi` plugin
- **Toast Notifications**: Automatic user feedback for all errors
- **Store Integration**: Consistent error handling across all stores

## 🚀 Quick Start

### Basic Usage

```typescript
import { useErrorHandler } from '~/composables/useErrorHandler'

const { handleError } = useErrorHandler()

try {
  // Your API call or operation
  const result = await $civicApi('/api/records')
} catch (error) {
  const errorMessage = handleError(error, {
    title: 'Failed to Load Records',
    showToast: true
  })
  // Handle error state in your component/store
}
```

### Specialized Handlers

```typescript
const { 
  handleApiError,
  handleNetworkError, 
  handleValidationError,
  handleAuthError 
} = useErrorHandler()

// For specific error types
const message = handleValidationError(error, {
  title: 'Form Validation Error',
  showToast: true
})
```

## 🔧 Error Handler Types

### `handleApiError()`
- **Purpose**: General API errors
- **Features**: Toast notifications, console logging
- **Use Case**: Most API failures

### `handleNetworkError()`
- **Purpose**: Connection and network issues
- **Features**: User-friendly network error messages
- **Use Case**: Offline scenarios, connection failures

### `handleValidationError()`
- **Purpose**: Form validation errors
- **Features**: Field-specific error details
- **Use Case**: Form submissions, input validation

### `handleAuthError()`
- **Purpose**: Authentication and authorization issues
- **Features**: Security-focused error handling
- **Use Case**: Login failures, permission denied

### `handleError()`
- **Purpose**: Smart error routing
- **Features**: Automatically determines error type and routes appropriately
- **Use Case**: General error handling when type is unknown

## ⚙️ Configuration Options

All error handlers accept an `ErrorOptions` object:

```typescript
interface ErrorOptions {
  title?: string           // Error title for toast
  showToast?: boolean      // Show toast notification (default: true)
  logToConsole?: boolean   // Log to console (default: true)
  fallbackMessage?: string // Fallback message if error parsing fails
}
```

## 🌐 API Interceptor

The `civicApi` plugin automatically handles common HTTP errors:

### Automatic Handling

- **401 Unauthorized**: Auto-clear auth state and redirect to login
- **403 Forbidden**: Show permission denied message
- **422 Validation Error**: Display validation details
- **500 Server Error**: Show generic server error message
- **Other Errors**: Generic error handling with user feedback

### Customization

The interceptor can be customized in `modules/ui/app/plugins/civicApi.ts`:

```typescript
async onResponseError({ response, error }) {
  const { handleError } = useErrorHandler()
  
  // Create error object
  const apiError = {
    status: response.status,
    statusText: response.statusText,
    data: response._data,
    url: response.url,
    message: response._data?.error?.message || response.statusText || 'Request failed'
  }

  // Handle specific status codes
  switch (response.status) {
    case 401:
      // Custom 401 handling
      break
    // ... other cases
  }
}
```

## 🏪 Store Integration

### Records Store

```typescript
// In modules/ui/app/stores/records.ts
try {
  const response = await useNuxtApp().$civicApi('/api/records')
  const data = validateApiResponse(response)
  // Process data
} catch (error: any) {
  const { handleError } = useErrorHandler()
  const errorMessage = handleError(error, {
    title: 'Failed to Load Records',
    showToast: true
  })
  this.error = errorMessage
  throw error
}
```

### Auth Store

```typescript
// In modules/ui/app/stores/auth.ts
try {
  const response = await useNuxtApp().$civicApi('/api/auth/login', {
    method: 'POST',
    body: { username, password }
  })
  return await this.handleLoginResponse(response, 'Login failed')
} catch (error: any) {
  const { handleError } = useErrorHandler()
  const errorMessage = handleError(error, {
    title: 'Login Failed',
    showToast: true
  })
  this.error = errorMessage
  throw error
}
```

## 🎨 Toast Notifications

All errors automatically show toast notifications with appropriate styling:

- **API Errors**: Red with alert circle icon
- **Network Errors**: Red with wifi-off icon (longer timeout)
- **Validation Errors**: Orange with alert triangle icon
- **Auth Errors**: Red with shield alert icon

### Toast Configuration

```typescript
$toast.add({
  title: 'Error Title',
  description: 'Error message',
  color: 'red',           // red, orange, green, blue
  icon: 'i-lucide-alert-circle',
  timeout: 5000           // milliseconds
})
```

## 🔍 Debugging

### Console Logging

All errors are logged to console by default:

```typescript
// Enable/disable console logging
handleError(error, {
  logToConsole: false  // Disable console logging
})
```

### Error Object Structure

The error object contains:

```typescript
{
  status: number,        // HTTP status code
  statusText: string,    // HTTP status text
  data: any,            // Response data
  url: string,          // Request URL
  message: string       // Error message
}
```

## 📋 Best Practices

### 1. Use Centralized Error Handling

```typescript
// ✅ Good
const { handleError } = useErrorHandler()
const message = handleError(error, { title: 'Operation Failed' })

// ❌ Avoid
console.error('Error:', error)
this.error = error.message || 'Unknown error'
```

### 2. Provide Context-Specific Titles

```typescript
// ✅ Good
handleError(error, { title: 'Failed to Load Records' })

// ❌ Avoid
handleError(error, { title: 'Error' })
```

### 3. Handle Errors at the Right Level

```typescript
// ✅ Good - Handle in store, let component handle UI
try {
  await this.loadRecords()
} catch (error) {
  const { handleError } = useErrorHandler()
  this.error = handleError(error, { title: 'Failed to Load Records' })
}

// ✅ Good - Handle in component for UI-specific errors
try {
  await this.validateForm()
} catch (error) {
  const { handleValidationError } = useErrorHandler()
  this.formError = handleValidationError(error)
}
```

### 4. Use Appropriate Error Types

```typescript
// ✅ Good - Use specific handlers
if (error.status === 422) {
  return handleValidationError(error)
} else if (error.code === 'NETWORK_ERROR') {
  return handleNetworkError(error)
} else {
  return handleApiError(error)
}

// ✅ Good - Use smart routing
return handleError(error) // Automatically determines type
```

## 🚀 Migration Guide

### From Manual Error Handling

**Before:**
```typescript
try {
  const response = await $civicApi('/api/records')
  if (response && response.success && response.data) {
    this.records = response.data
  } else {
    this.error = 'Failed to load records'
  }
} catch (error) {
  console.error('Error:', error)
  this.error = error.message || 'Unknown error'
}
```

**After:**
```typescript
try {
  const response = await $civicApi('/api/records')
  const data = validateApiResponse(response)
  this.records = data
} catch (error) {
  const { handleError } = useErrorHandler()
  this.error = handleError(error, { title: 'Failed to Load Records' })
}
```

## 📚 Related Documentation

- [Development Pattern](./dev-pattern.md) - Overall development approach
- [API Integration Guide](./api-integration-guide.md) - API usage patterns
- [UI Components](./ui.md) - UI component patterns

---

**Last Updated**: July 2025  
**Status**: ✅ Active  
**Maintainer**: CivicPress Team 