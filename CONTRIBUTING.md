# 🤝 Contributing to CivicPress

Thank you for your interest in contributing to CivicPress! This guide will help
you get started.

## 🌟 Our Mission

CivicPress exists to bring transparency, participation, and trust back to local
governance. We're building open, modular, Git-native civic software that is
accessible, auditable, and human-centered.

## 📋 Before You Start

- Familiarize yourself with our
  [manifesto](https://github.com/CivicPress/civicpress/blob/main/records/manifesto.md)
- Check existing issues and discussions before creating new ones

## 🚀 Development Setup

### Prerequisites

- Node.js 20.11.1+ (see `.nvmrc`)
- pnpm package manager
- Git

### Quick Start

```bash
# Clone the repository
git clone https://github.com/CivicPress/civicpress.git
cd civicpress

# Install dependencies
./setup.sh

# Verify setup
pnpm run format:check
```

## 📝 Development Workflow

### 1. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make Your Changes

- Follow our coding standards (see below)
- Write clear, accessible documentation
- Add tests for new functionality
- Update relevant documentation

### 3. Commit Your Changes

We use [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# Format: type(scope): description
git commit -m "feat(core): add new civic record type"
git commit -m "fix(modules): resolve legal register validation issue"
git commit -m "docs(readme): update installation instructions"
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### 4. Format and Test

```bash
# Format code
pnpm run format

# Check formatting
pnpm run format:check

# Run tests (when available)
pnpm test
```

### 5. Submit a Pull Request

- Create a clear, descriptive title
- Include a detailed description of changes
- Reference any related issues
- Ensure all CI checks pass

## 🎯 Development Standards

### Code Quality

- **Formatting**: All code must be formatted with Prettier
- **Accessibility**: Ensure all features are accessible to diverse users
- **Documentation**: Write clear, comprehensive documentation
- **Testing**: Add tests for new functionality

### Civic-First Principles

- **Transparency**: Code should be clear and explainable
- **Auditability**: All changes should be traceable
- **Accessibility**: Build for everyone, not just tech-savvy users
- **Safety**: Prioritize civic safety over clever automation

### Documentation Standards

- Use clear, simple language
- Include examples where helpful
- Consider diverse audiences
- Keep documentation up-to-date

## 🐛 Reporting Issues

When reporting issues, please include:

- Clear description of the problem
- Steps to reproduce
- Expected vs. actual behavior
- Environment details (OS, Node version, etc.)
- Screenshots if applicable

## 💡 Feature Requests

We welcome feature requests! When suggesting new features:

- Explain the civic problem it solves
- Consider accessibility and equity
- Think about long-term maintainability
- Align with our core principles

## 🏗️ Project Structure

```
civicpress/
├── .civic/          # Platform configuration
├── agent/           # AI development context
├── core/            # Core platform modules
├── modules/         # Civic modules
├── docs/            # Documentation
└── tests/           # Test files
```

## 🤔 Questions?

- Check existing issues and discussions
- Join our community discussions
- Reach out to maintainers at hello@civic-press.org
- Get involved through our [community form](https://tally.so/r/wAYBvN)

## 🙏 Thank You

Every contribution, no matter how small, helps build better civic technology.
Thank you for being part of this mission!

---

**Together, we're building the future of transparent, accessible governance.**
