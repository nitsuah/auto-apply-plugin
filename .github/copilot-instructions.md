# GitHub Copilot Instructions

This file provides custom instructions to GitHub Copilot when working in this repository.

## Project Context

**Project Name:** auto-apply-plugin  
**Description:** A JavaScript plugin designed for automated job application via specific configurations or actions on an ATS form.
**Tech Stack:** JavaScript, Node.js (for tooling)
**Outcome:** Chrome plugin that applies to jobs for you

## Code Style & Conventions

### General Guidelines

- Follow existing code patterns and file structure.
- Maintain consistent naming conventions across the codebase (e.g., `camelCase` for variables and functions, `PascalCase` for classes/constructors).
- Write self-documenting code with clear variable and function names.
- Add comments only when the code's intent is not immediately clear or for complex algorithms (use JSDoc for public API functions).
- Adhere to ESLint rules defined in the project.

### Language-Specific Guidelines

-   **JavaScript**:
    -   Use ESNext features (`const`, `let`, arrow functions, async/await).
    -   Prefer `const` over `let` when a variable is not reassigned. Avoid `var`.
    -   Use JSDoc for documenting functions, parameters, and return types, especially for public-facing API.
    -   Prefer pure functions where possible, minimizing side effects.
    -   Handle asynchronous operations with `async/await` and proper `try/catch` blocks.

### File Organization

-   Source code resides in the `src/` directory.
-   Build output (if any) goes into `dist/`.
-   Tests are located in the `test/` directory, mirroring the `src/` structure.
-   Keep files focused on a single responsibility.
-   Use `index.js` for barrel exports where appropriate within modules.

## Architecture Patterns

### Module Structure

-   Keep modules small, focused, and reusable.
-   Each module should ideally export a single primary function or object.
-   Minimize inter-module dependencies; prefer explicit imports.

### State Management & Side Effects

-   If state is necessary, encapsulate it within functions or objects.
-   Be explicit about functions that produce side effects.
-   Handle external interactions (e.g., DOM manipulation, API calls) carefully, separating them from pure logic.

### Plugin API Design

-   Design the plugin's public API to be clear, consistent, and easy to use.
-   Validate all inputs to public functions.
-   Provide sensible default options.
-   Ensure proper error handling and informative error messages for API consumers.

## Testing Strategy

-   Write unit tests for all utility functions and core logic (e.g., in `src/utils/`).
-   Write integration tests for the main plugin