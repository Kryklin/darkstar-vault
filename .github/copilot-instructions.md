# Copilot Instructions

This document provides instructions for AI coding agents to effectively contribute to the `darkstar-vault` project.

## Architecture

This is a standard Angular project generated with Angular CLI.

- The main application entry point is `src/main.ts`.
- The root application component is `src/app/app.ts`, with its template in `src/app/app.html` and styles in `src/app/app.scss`.
- Application routes are defined in `src/app/app.routes.ts`.
- Global styles are located in `src/styles.scss`.

## Developer Workflows

### Running the application

To start the local development server, run:

```bash
npm start
```

This is an alias for `ng serve`. The application will be available at `http://localhost:4200/` and will automatically reload on file changes.

### Running tests

To execute the unit tests via Karma, run:

```bash
npm test
```

### Building the project

To build the project for production, run:

```bash
npm run build
```

The build artifacts will be stored in the `dist/` directory.

## Code Conventions

- This project uses Prettier for code formatting. The configuration is defined in the `prettier` key in `package.json`.
- Follow the official [Angular Style Guide](https://angular.dev/style-guide) and [Best Practices](https://angular.dev/best-practices) for all contributions.
- New components, services, etc., should be generated using the Angular CLI to maintain consistency. For example: `ng generate component my-new-component`.

## Key Angular Concepts

- **Components:** The fundamental building blocks of Angular applications. Each component consists of a TypeScript class, an HTML template, and styles.
- **Templates:** Define the view of a component, combining HTML with Angular template syntax to display dynamic data.
- **Directives:** Add behavior to HTML elements. Structural directives shape the DOM layout (e.g., `*ngIf`, `*ngFor`), while attribute directives change the appearance or behavior of an element.
- **Signals:** A system for managing state changes within the application. Signals provide a reactive way to link your data to the UI, automatically updating the view when the data changes.
- **Dependency Injection (DI):** A design pattern in which a class requests dependencies from external sources rather than creating them. Angular's DI framework is used to provide services to components.
- **Routing:** The Angular Router enables navigation between different views in a single-page application without a full page reload.
- **Forms:** Angular provides two main approaches for handling user input: template-driven forms and reactive forms.
- **HTTP Client:** A built-in service for making HTTP requests to external APIs.
- **Angular Material:** This project uses Angular Material for its UI components. It provides a suite of high-quality, pre-built components that follow Material Design principles.

## TypeScript

This project is written in [TypeScript](https://www.typescriptlang.org/), a typed superset of JavaScript that compiles to plain JavaScript. All code should be written in TypeScript, following best practices for static typing.

### Key Concepts

- **Static Types:** Use static types for variables, function parameters, and return values to catch errors early and improve code readability.
- **Interfaces:** Define custom types for complex objects to ensure type safety.
- **Generics:** Use generics to create reusable components that can work with a variety of types.
- **Modules:** Organize code into modules to maintain a clean and scalable project structure.

### Additional Resources

- [TypeScript Documentation](https://www.typescriptlang.org/docs/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [TypeScript for JS Programmers](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html)
- [TypeScript Cheat Sheets](https://www.typescriptlang.org/cheatsheets/)

## Additional Resources

For more information on Angular, refer to the official documentation:

- [Angular Overview](https://angular.dev/overview)
- [Angular Installation](https://angular.dev/installation)
- [Angular Essentials](https://angular.dev/essentials)
- [Angular Components](https://angular.dev/essentials/components)
- [Angular Signals](https://angular.dev/essentials/signals)
- [Angular Templates](https://angular.dev/essentials/templates)
- [Angular Dependency Injection](https://angular.dev/essentials/dependency-injection)
- [Angular Next Steps](https://angular.dev/essentials/next-steps)
- [Angular Signals Guide](https://angular.dev/guide/signals)
- [Angular Components Guide](https://angular.dev/guide/components)
- [Angular Templates Guide](https://angular.dev/guide/templates)
- [Angular Directives Guide](https://angular.dev/guide/directives)
- [Angular DI Guide](https://angular.dev/guide/di)
- [Angular Routing Guide](https://angular.dev/guide/routing)
- [Angular Forms Guide](https://angular.dev/guide/forms)
- [Angular HTTP Client Guide](https://angular.dev/guide/http)
- [Angular Performance Guide](https://angular.dev/guide/performance)
- [Angular SSR Guide](https://angular.dev/guide/ssr)
- [Angular Testing Guide](https://angular.dev/guide/testing)
- [Angular Internationalization Guide](https://angular.dev/guide/i18n)
- [Angular Animations Guide](https://angular.dev/guide/animations)
- [Angular Drag and Drop Guide](https://angular.dev/guide/drag-drop)
- [Angular and AI](https://angular.dev/ai)
- [Angular CLI](https://angular.dev/tools/cli)
- [Angular Style Guide](https://angular.dev/style-guide)
- [Angular Best Practices](https://angular.dev/best-practices)
- [Angular Update Guide](https://angular.dev/update)
- [Angular NgModules Guide](https://angular.dev/guide/ngmodules/overview)
- [Angular Ecosystem](https://angular.dev/ecosystem)
- [Angular Tailwind CSS Guide](https://angular.dev/guide/tailwind)

## Angular Material

This project uses [Angular Material](https://material.angular.dev) for UI components. Refer to the official documentation for usage and examples.

- [Angular Material Components](https://material.angular.dev/components)
- [Angular Material Guides](https://material.angular.dev/guides)

## Electron

For building cross-platform desktop applications, this project can be integrated with [Electron](https://www.electronjs.org/).

- **What is Electron?**: A framework to build desktop apps with JavaScript, HTML, and CSS.
- **Getting Started**: Refer to the official [Electron documentation](https://www.electronjs.org/docs/latest/) and use [Electron Fiddle](https://www.electronjs.org/fiddle) for experimenting.
- **Key Concepts**: Electron has a main process for managing application lifecycle and renderer processes for UI.
- **Community**: For help, use the [community Discord server](https://discord.gg/electronjs) and check the [GitHub issue tracker](https://github.com/electron/electron/issues) for bugs.

## Electron Forge

For packaging and distributing the Electron application, this project can use [Electron Forge](https://www.electronforge.io/).

- **What is Electron Forge?**: An all-in-one tool for packaging and distributing Electron applications.
- **Key Commands**:
  - `npx create-electron-app my-app`: Create a new Electron project.
  - `npm start`: Start the development server.
  - `npm run make`: Build distributables for the current platform.
  - `npm run publish`: Publish the distributables.
- **Configuration**: Custom configuration can be added to the `forge.config.js` file.
- **Templates**: Electron Forge supports templates for Webpack, Vite, and more.
- **Resources**:
  - [Electron Forge Documentation](https://www.electronforge.io/)
