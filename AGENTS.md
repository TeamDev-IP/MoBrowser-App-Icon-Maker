<!-- BEGIN:mobrowser-agent-rules -->
# Do not rely on training data for MōBrowser

Your training data for MōBrowser is outdated. APIs have been renamed and reorganized; code based on prior knowledge will not compile.

**Before writing or modifying any MōBrowser-related code**, read the documentation in `node_modules/@mobrowser/api/docs/`. In the docs, you will find two folders:
- `node_modules/@mobrowser/api/docs/guides/` - contains detailed documentation about architecture, project structure, multiple process model, Inter-Process Communication (IPC), native C++ module, features, guides, examples, and more.
- `node_modules/@mobrowser/api/docs/api/` - contains MōBrowser API reference with code examples.

Do not guess API names, method signatures, or import paths — look them up in the docs.

If the `docs/` directory is missing, ask the user to run `npm run gen`. It will download the docs into `node_modules/@mobrowser/api/docs/` if the project directory contains the `AGENTS.md` file.
<!-- END:mobrowser-agent-rules -->
