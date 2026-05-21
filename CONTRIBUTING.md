# Contributing to Apply Workspace

Thank you for helping improve Apply Workspace. This guide keeps contributions consistent with the project's local-first and review-first goals.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Coding Standards](#coding-standards)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)

## 🤝 Code of Conduct

This project adheres to [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). By participating, you agree to uphold those standards.

## 🚀 Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/auto-apply-plugin.git
   cd auto-apply-plugin
   ```
3. **Add the upstream repository**:
   ```bash
   git remote add upstream https://github.com/nitsuah/auto-apply-plugin.git
   ```
4. **Create a new branch** for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## 💡 How to Contribute

### Types of Contributions

- **Bug fixes**: Fix issues or problems in the codebase
- **New features**: Add new functionality or capabilities
- **Documentation**: Improve or add to project documentation
- **Tests**: Add or improve test coverage
- **Performance**: Optimize existing code
- **Refactoring**: Improve code quality without changing functionality

### Before You Start

- Check existing [issues](../../issues) and [pull requests](../../pulls) to avoid duplicate work
- For major changes, please open an issue first to discuss what you would like to change
- Make sure your code follows the project's coding standards

## 🛠️ Development Setup

### Prerequisites

- Node.js 20+ and npm for local validation
- Google Chrome (for manual extension QA)
- Docker Desktop (recommended for clean-room validation)

### Installation

```bash
# Install dependencies
npm install
```

### Running Tests

```bash
# Run main test suite (logic coverage)
npm test

# Run all test files (includes runtime/lint guard test)
node --test tests/*.mjs
```

### Linting

```bash
# Lint code
npm run lint
```

### Docker Validation (Recommended)

```bash
docker run --rm -v "${PWD}:/app" -w /app node:20-alpine sh -lc "node --check popup/popup.js; node --check background/service-worker.js; node --check content/content.js; npm test"

docker run --rm -v "${PWD}:/app" -w /app node:20-alpine sh -lc "npm install; npm run lint"
```

## 🔄 Pull Request Process

1. **Update your branch** with the latest upstream changes:

   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

2. **Make your changes** following the coding standards

3. **Test your changes** thoroughly:
   - Run all existing tests
   - Add new tests for new features
   - Ensure all tests pass
   - Check code coverage

4. **Commit your changes** with clear, descriptive messages:

   ```bash
   git commit -m "feat: add new feature description"
   ```

   Follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation changes
   - `test:` for adding or updating tests
   - `refactor:` for code refactoring
   - `chore:` for maintenance tasks

5. **Push to your fork**:

   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request** on GitHub:
   - Provide a clear title and description
   - Reference any related issues
   - Include screenshots/videos for UI changes
   - Ensure CI checks pass

7. **Respond to feedback** from maintainers and update as needed

## 📝 Coding Standards

### General Guidelines

- Write clean, readable, and maintainable code
- Follow the existing code style and conventions
- Add comments for complex logic
- Keep functions small and focused
- Use meaningful variable and function names

### Language-Specific Standards

- **JavaScript (ES Modules)**:
   - Use `const` by default, `let` only when reassignment is required
  - Follow ESLint rules
  - Use async/await over promises when possible
   - Keep modules focused and avoid hidden side effects

### Testing

- Write unit tests for new functions
- Add runtime safety checks where UI wiring or exports are touched
- Keep or improve current coverage when modifying core flows
- Test edge cases and error conditions

### Documentation

- Update README.md for new features
- Add JSDoc/docstring comments for public APIs
- Update CHANGELOG.md for notable changes
- Include inline comments for complex logic

## 🐛 Reporting Bugs

When reporting bugs, please include:

- **Clear title and description**
- **Steps to reproduce** the issue
- **Expected behavior** vs actual behavior
- **Screenshots or error messages** if applicable
- **Environment details**: OS, browser, version numbers, etc.
- **Possible solution** if you have one

Use the [bug report template](../../issues/new?template=bug_report.md) if available.

## 💡 Suggesting Features

When suggesting features, please include:

- **Clear title and description**
- **Use case**: Why is this feature needed?
- **Proposed solution**: How should it work?
- **Alternatives considered**: Other approaches you've thought about
- **Additional context**: Screenshots, mockups, examples

Use the [feature request template](../../issues/new?template=feature_request.md) if available.

## 🙏 Recognition

Contributors will be recognized in:

- The project README
- Release notes for significant contributions

## 📄 License

By contributing, you agree that your contributions will be licensed under the same license as the project.

## 📧 Questions?

If you have questions, feel free to:

- Open an issue with the `question` label
- Open a draft pull request for early feedback

Thank you for contributing! 🎉
