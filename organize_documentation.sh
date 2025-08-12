#!/bin/bash

# Documentation Organization Script for beat-parser
# This script systematically organizes all MD files into proper directories

set -e  # Exit on error

echo "📚 Starting Documentation Organization..."
echo "========================================="

# Create directory structure if not exists
echo "📁 Creating directory structure..."
mkdir -p docs/core
mkdir -p docs/testing
mkdir -p docs/testing/consolidated
mkdir -p docs/testing/reports
mkdir -p docs/api
mkdir -p docs/guides
mkdir -p docs/archive/redundant
mkdir -p docs/archive/meta
mkdir -p docs/development

# Function to move file with confirmation
move_file() {
    local source=$1
    local dest=$2
    if [ -f "$source" ]; then
        echo "  → Moving $source to $dest"
        mv "$source" "$dest"
    else
        echo "  ⚠️  $source not found, skipping"
    fi
}

echo ""
echo "📂 STEP 1: Core Documentation (Root Level)"
echo "==========================================="
# These stay in root for visibility
echo "Keeping in root directory:"
echo "  ✓ README.md (main entry point)"
echo "  ✓ CHANGELOG.md (version history)"
echo "  ✓ CONTRIBUTING.md (contribution guide)"

echo ""
echo "📂 STEP 2: Core Documentation → docs/core/"
echo "==========================================="
move_file "SETUP.md" "docs/core/"
move_file "ARCHITECTURE.md" "docs/core/"
move_file "API.md" "docs/core/"

echo ""
echo "📂 STEP 3: Testing Documentation → docs/testing/"
echo "================================================="

# Main testing index
move_file "TESTING_INDEX.md" "docs/testing/"

# Consolidated testing documents
echo "Moving consolidated testing docs to docs/testing/consolidated/:"
move_file "API_TESTING.md" "docs/testing/consolidated/"
move_file "ERROR_HANDLING_TESTING.md" "docs/testing/consolidated/"
move_file "INTEGRATION_TESTING.md" "docs/testing/consolidated/"
move_file "WORKER_TESTING.md" "docs/testing/consolidated/"
move_file "CROSS_PLATFORM_TESTING.md" "docs/testing/consolidated/"
move_file "AUDIO_INPUT_TESTING.md" "docs/testing/consolidated/"
move_file "GENRE_TESTING.md" "docs/testing/consolidated/"
move_file "PERFORMANCE_REPORT.md" "docs/testing/consolidated/"
move_file "PICTURE_COUNT_TESTING.md" "docs/testing/consolidated/"

# Original testing reports (to be archived)
echo "Archiving redundant testing reports to docs/archive/redundant/:"
move_file "API_TESTING_REPORT.md" "docs/archive/redundant/"
move_file "API_TESTING_SUMMARY.md" "docs/archive/redundant/"
move_file "ERROR_HANDLING_REPORT.md" "docs/archive/redundant/"
move_file "ERROR_HANDLING_SUMMARY.md" "docs/archive/redundant/"
move_file "INTEGRATION_TESTING_REPORT.md" "docs/archive/redundant/"
move_file "INTEGRATION_TESTING_SUMMARY.md" "docs/archive/redundant/"
move_file "WORKER_TESTING_REPORT.md" "docs/archive/redundant/"
move_file "WORKER_TESTING_SUMMARY.md" "docs/archive/redundant/"
move_file "CROSS_PLATFORM_REPORT.md" "docs/archive/redundant/"
move_file "CROSS_PLATFORM_SUMMARY.md" "docs/archive/redundant/"
move_file "AUDIO_INPUT_TEST_REPORT.md" "docs/archive/redundant/"
move_file "GENRE_TESTING_GUIDE.md" "docs/archive/redundant/"
move_file "GENRE_TESTING_SUMMARY.md" "docs/archive/redundant/"

echo ""
echo "📂 STEP 4: Navigation & Guides → docs/guides/"
echo "=============================================="
move_file "MASTER_DOCUMENTATION.md" "docs/guides/"
move_file "DOCUMENTATION_MAP.md" "docs/guides/"
move_file "DOCUMENTATION_USAGE_GUIDE.md" "docs/guides/"

echo ""
echo "📂 STEP 5: Meta Documentation → docs/archive/meta/"
echo "==================================================="
move_file "DOCUMENTATION_CONSOLIDATION_COMPLETE.md" "docs/archive/meta/"
move_file "DELETION_REPORT.md" "docs/archive/meta/"
move_file "CLEANUP_SUMMARY.md" "docs/archive/meta/"
move_file "FINAL_DOCUMENTATION_METRICS.md" "docs/archive/meta/"

echo ""
echo "📂 STEP 6: Implementation Files (if any)"
echo "========================================="
# Check for implementation-related MD files
if [ -f "IMPLEMENTATION_SUMMARY.md" ]; then
    move_file "IMPLEMENTATION_SUMMARY.md" "docs/archive/redundant/"
fi
if [ -f "ENHANCED_ALGORITHMS.md" ]; then
    move_file "ENHANCED_ALGORITHMS.md" "docs/archive/redundant/"
fi

echo ""
echo "📊 STEP 7: Creating Directory Index Files"
echo "========================================="

# Create index for docs/core
cat > docs/core/INDEX.md << 'EOF'
# Core Documentation

This directory contains the essential documentation for the beat-parser library.

## Files

- **[SETUP.md](SETUP.md)** - Installation and configuration guide
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture and technical design
- **[API.md](API.md)** - Complete API reference and usage guide

## Navigation

- [← Back to Main README](../../README.md)
- [→ Testing Documentation](../testing/TESTING_INDEX.md)
- [→ Documentation Guide](../guides/MASTER_DOCUMENTATION.md)
EOF

# Create index for docs/testing
cat > docs/testing/INDEX.md << 'EOF'
# Testing Documentation

Complete testing documentation for the beat-parser library.

## Structure

### Main Index
- **[TESTING_INDEX.md](TESTING_INDEX.md)** - Master testing documentation hub

### Consolidated Test Documentation (`consolidated/`)
All testing domains with comprehensive coverage:
- API Testing
- Error Handling Testing
- Integration Testing
- Worker Testing
- Cross-Platform Testing
- Audio Input Testing
- Genre Testing
- Performance Testing
- Picture Count Testing

### Archived Reports (`../archive/redundant/`)
Original testing reports archived for reference (content merged into consolidated docs).

## Navigation

- [← Back to Main README](../../README.md)
- [→ Core Documentation](../core/INDEX.md)
- [→ Documentation Guide](../guides/MASTER_DOCUMENTATION.md)
EOF

# Create index for docs/guides
cat > docs/guides/INDEX.md << 'EOF'
# Documentation Guides

Navigation and usage guides for the beat-parser documentation.

## Files

- **[MASTER_DOCUMENTATION.md](MASTER_DOCUMENTATION.md)** - Ultimate documentation hub
- **[DOCUMENTATION_MAP.md](DOCUMENTATION_MAP.md)** - Complete navigation map
- **[DOCUMENTATION_USAGE_GUIDE.md](DOCUMENTATION_USAGE_GUIDE.md)** - How to use the documentation

## Quick Links

- [← Back to Main README](../../README.md)
- [→ Core Documentation](../core/INDEX.md)
- [→ Testing Documentation](../testing/TESTING_INDEX.md)
EOF

# Create main docs index
cat > docs/INDEX.md << 'EOF'
# Beat Parser Documentation

Welcome to the organized documentation structure for beat-parser.

## 📚 Documentation Structure

```
docs/
├── core/                  # Essential documentation
│   ├── SETUP.md          # Installation guide
│   ├── ARCHITECTURE.md   # Technical design
│   └── API.md           # API reference
│
├── testing/              # Testing documentation
│   ├── TESTING_INDEX.md # Testing hub
│   └── consolidated/    # All test documentation
│
├── guides/              # Navigation guides
│   ├── MASTER_DOCUMENTATION.md
│   ├── DOCUMENTATION_MAP.md
│   └── DOCUMENTATION_USAGE_GUIDE.md
│
└── archive/            # Archived content
    ├── redundant/     # Redundant files (for deletion)
    └── meta/         # Meta documentation
```

## 🚀 Quick Start

1. **New Users**: Start with [README](../README.md) → [SETUP](core/SETUP.md) → [API](core/API.md)
2. **Developers**: Go directly to [API Reference](core/API.md)
3. **Contributors**: See [CONTRIBUTING](../CONTRIBUTING.md) and [Architecture](core/ARCHITECTURE.md)
4. **Testing**: Browse [Testing Documentation](testing/TESTING_INDEX.md)

## 📖 Main Entry Points

- **[README.md](../README.md)** - Project overview
- **[CONTRIBUTING.md](../CONTRIBUTING.md)** - How to contribute
- **[CHANGELOG.md](../CHANGELOG.md)** - Version history
- **[Documentation Guide](guides/MASTER_DOCUMENTATION.md)** - Complete navigation

## 🗂️ Directory Purposes

| Directory | Purpose | Audience |
|-----------|---------|----------|
| `core/` | Essential technical docs | All users |
| `testing/` | Test coverage & validation | QA & developers |
| `guides/` | Navigation & how-to | All users |
| `archive/redundant/` | To be deleted | N/A |
| `archive/meta/` | Consolidation reports | Maintainers |
EOF

echo ""
echo "📊 STEP 8: Final Statistics"
echo "============================"

# Count files in each directory
echo "File distribution:"
echo "  Root directory: $(ls *.md 2>/dev/null | wc -l) files"
echo "  docs/core: $(ls docs/core/*.md 2>/dev/null | wc -l) files"
echo "  docs/testing/consolidated: $(ls docs/testing/consolidated/*.md 2>/dev/null | wc -l) files"
echo "  docs/guides: $(ls docs/guides/*.md 2>/dev/null | wc -l) files"
echo "  docs/archive/redundant: $(ls docs/archive/redundant/*.md 2>/dev/null | wc -l) files (ready for deletion)"
echo "  docs/archive/meta: $(ls docs/archive/meta/*.md 2>/dev/null | wc -l) files"

echo ""
echo "✅ Documentation Organization Complete!"
echo "======================================="
echo ""
echo "📋 Next Steps:"
echo "1. Review the new structure in docs/"
echo "2. Update README.md with links to new locations"
echo "3. Delete docs/archive/redundant/ when ready"
echo "4. Update any CI/CD scripts that reference old paths"
echo ""
echo "🎯 Result: Clean, organized documentation structure!"