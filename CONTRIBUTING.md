# Contributing to @beat-parser/core

Thank you for considering contributing to @beat-parser/core! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Submitting Changes](#submitting-changes)
- [Release Process](#release-process)

## Code of Conduct

This project follows standard open source community guidelines. By participating, you are expected to be respectful and constructive.

## Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm (comes with Node.js)
- Git

### Types of Contributions

We welcome several types of contributions:

- **Bug Reports**: Found a bug? Let us know!
- **Feature Requests**: Have an idea for improvement?
- **Code Contributions**: Bug fixes, new features, performance improvements
- **Documentation**: Improve documentation, add examples
- **Testing**: Add test cases, improve test coverage

## Development Setup

1. **Fork the repository** on GitHub

2. **Clone your fork locally**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/beat-parser.git
   cd beat-parser
   ```

3. **Add the upstream remote**:
   ```bash
   git remote add upstream https://github.com/username/beat-parser.git
   ```

4. **Install dependencies**:
   ```bash
   npm install
   ```

5. **Verify the setup**:
   ```bash
   npm test
   npm run build
   ```

## Development Workflow

### Branch Strategy

- `main`: Production-ready code
- `develop`: Integration branch for features
- `feature/*`: New features and enhancements
- `fix/*`: Bug fixes
- `docs/*`: Documentation updates

### Creating a Branch

```bash
# For new features
git checkout -b feature/your-feature-name

# For bug fixes
git checkout -b fix/issue-description

# For documentation
git checkout -b docs/documentation-update
```

### Development Commands

```bash
# Development mode (watch for changes)
npm run dev

# Run tests
npm test
npm run test:watch
npm run test:coverage

# Code quality checks
npm run type-check
npm run lint
npm run format:check

# Fix code issues
npm run lint:fix
npm run format

# Build the package
npm run build

# Clean build artifacts
npm run clean
```

### Keeping Your Fork Updated

```bash
git fetch upstream
git checkout main
git merge upstream/main
git push origin main
```

## Coding Standards

### TypeScript Guidelines

- Use TypeScript strict mode
- Provide proper type annotations
- Use interfaces for object shapes
- Use enums for constants
- Document complex types with JSDoc

### Code Style

We use Prettier and ESLint to maintain code consistency:

- **Indentation**: 2 spaces
- **Quotes**: Single quotes for strings
- **Semicolons**: Always use semicolons
- **Line Length**: 100 characters maximum
- **Naming**: 
  - `camelCase` for variables and functions
  - `PascalCase` for classes and interfaces
  - `UPPER_SNAKE_CASE` for constants

### File Organization

```
src/
├── core/           # Core parsing logic
├── algorithms/     # Beat detection algorithms
├── parsers/        # Parser implementations
├── utils/          # Utility functions
├── types/          # Type definitions
├── worker/         # Web Worker integration
├── examples/       # Usage examples
└── __tests__/      # Test files
```

### Import/Export Guidelines

- Use named exports over default exports
- Group imports: external libraries, internal modules, types
- Use relative imports for local modules

Example:
```typescript
// External libraries
import { EventEmitter } from 'events';

// Internal modules
import { AudioProcessor } from '../core/AudioProcessor';
import { validateAudioData } from '../utils/validation';

// Types
import type { BeatDetectionOptions } from '../types';
```

## Testing

### Testing Philosophy

- **Unit Tests**: Test individual functions and classes
- **Integration Tests**: Test component interactions
- **Performance Tests**: Validate performance requirements
- **Real-world Tests**: Test with actual audio data

### Writing Tests

```typescript
describe('BeatParser', () => {
  describe('analyze', () => {
    it('should detect beats in a simple rhythm', () => {
      const parser = new BeatParser();
      const audioData = createTestAudioData();
      
      const result = parser.analyze(audioData);
      
      expect(result.beats).toHaveLength(4);
      expect(result.tempo).toBeCloseTo(120, 1);
    });
  });
});
```

### Test Requirements

- All new features must include tests
- Bug fixes must include regression tests
- Aim for >80% code coverage
- Tests should be deterministic
- Use descriptive test names

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test BeatParser.test.ts
```

## Documentation

### JSDoc Comments

Document public APIs with JSDoc:

```typescript
/**
 * Analyzes audio data to detect beats and rhythm patterns.
 * 
 * @param audioData - The audio data to analyze (Float32Array)
 * @param options - Optional configuration for beat detection
 * @returns Promise resolving to beat analysis results
 * 
 * @example
 * ```typescript
 * const parser = new BeatParser();
 * const result = await parser.analyze(audioData, {
 *   sensitivity: 0.8,
 *   minTempo: 60,
 *   maxTempo: 180
 * });
 * ```
 */
public analyze(
  audioData: Float32Array,
  options?: BeatDetectionOptions
): Promise<BeatAnalysisResult>
```

### Documentation Types

- **README.md**: Overview, installation, quick start
- **API.md**: Complete API documentation
- **Examples**: Practical usage examples
- **CHANGELOG.md**: Version history and changes

## Submitting Changes

### Before Submitting

1. **Ensure all tests pass**:
   ```bash
   npm test
   npm run type-check
   npm run lint
   npm run build
   ```

2. **Update documentation** if needed

3. **Add changelog entry** for significant changes

4. **Rebase your branch** on the latest upstream:
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

### Pull Request Process

1. **Create a pull request** against the `main` branch

2. **Fill out the PR template** completely

3. **Link related issues** using keywords (e.g., "Fixes #123")

4. **Request review** from maintainers

5. **Address feedback** and update your PR

6. **Squash commits** if requested

### Pull Request Guidelines

- **Single Purpose**: One feature/fix per PR
- **Clear Title**: Descriptive title following conventional commits
- **Detailed Description**: Explain what, why, and how
- **Tests**: Include appropriate tests
- **Documentation**: Update relevant documentation
- **No Breaking Changes**: Avoid breaking changes in patches

## Release Process

Releases are handled by maintainers following semantic versioning:

- **MAJOR** (1.0.0): Breaking changes
- **MINOR** (0.1.0): New features (backwards compatible)
- **PATCH** (0.0.1): Bug fixes

### Version Bumping

```bash
# Patch release (bug fixes)
npm version patch

# Minor release (new features)
npm version minor

# Major release (breaking changes)
npm version major
```

## Performance Considerations

When contributing, consider:

- **Memory Usage**: Avoid memory leaks, clean up resources
- **Computational Complexity**: Optimize hot paths
- **Bundle Size**: Keep the package size reasonable
- **Browser Compatibility**: Support target environments

## Audio Processing Guidelines

- **Sample Rate**: Handle various sample rates (44.1kHz, 48kHz, 22kHz, 16kHz)
- **Channel Support**: Support mono and stereo audio (convert stereo to mono)
- **Data Validation**: Validate audio data input (range, format, length)
- **Numerical Stability**: Use appropriate precision for floating-point calculations
- **Memory Management**: Handle large audio files efficiently with streaming
- **Format Support**: Maintain compatibility with all supported audio formats
- **Performance**: Optimize for real-time processing capabilities
- **Error Handling**: Provide clear, actionable error messages

For technical architecture details, see **[ARCHITECTURE.md](ARCHITECTURE.md)**.

## Getting Help

### Development Support
- **[GitHub Issues](https://github.com/username/beat-parser/issues)**: Bug reports and feature requests
- **[GitHub Discussions](https://github.com/username/beat-parser/discussions)**: Questions and general discussion  
- **Documentation**: Check [DOCUMENTATION_MAP.md](DOCUMENTATION_MAP.md) for complete guide navigation

### Technical Resources
- **[API Documentation](API.md)**: Complete API reference with examples
- **[Architecture Guide](ARCHITECTURE.md)**: Technical design and algorithms
- **[Setup Guide](SETUP.md)**: Installation and configuration help
- **[Testing Documentation](TESTING_INDEX.md)**: Testing frameworks and examples

### Security & Private Issues
- **Email**: For security vulnerabilities or sensitive issues
- **Private Discussion**: Use GitHub's private vulnerability reporting

### Before Asking for Help
1. **Check existing documentation** - Most questions are covered in our guides
2. **Search existing issues** - Your question may already be answered
3. **Try the troubleshooting guides** - Common issues are documented
4. **Provide context** - Include code samples, error messages, and environment details

## Recognition

We appreciate all contributions! Contributors are recognized in multiple ways:

### Public Recognition
- **[CHANGELOG.md](CHANGELOG.md)**: All significant contributions documented with credit
- **[README.md](README.md)**: Major contributors listed in credits section
- **Package.json**: Contributors field for npm package
- **GitHub Contributors**: Automatic GitHub contributor recognition

### Contribution Types Recognized
- **Code contributions**: New features, bug fixes, performance improvements
- **Documentation**: Writing, editing, and improving documentation
- **Testing**: Adding test cases, improving coverage, finding bugs
- **Design**: UX/UI improvements, architectural design
- **Community**: Helping other contributors, answering questions

### First-Time Contributors
- **Special recognition** for first-time open source contributors
- **Mentorship available** for those new to the project
- **Good first issues** labeled for newcomers

## License

By contributing to @beat-parser/core, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to @beat-parser/core! 🎵