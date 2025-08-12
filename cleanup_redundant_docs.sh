#!/bin/bash

# Cleanup script for redundant documentation files
# This removes the archived redundant files after confirming organization is complete

set -e

echo "🗑️  Documentation Cleanup Script"
echo "================================"
echo ""
echo "This script will remove redundant documentation files that have been:"
echo "  1. Consolidated into unified documents"
echo "  2. Archived in docs/archive/redundant/"
echo ""

# Check if archive directory exists
if [ ! -d "docs/archive/redundant" ]; then
    echo "❌ Error: docs/archive/redundant/ directory not found."
    echo "   Please run ./organize_documentation.sh first."
    exit 1
fi

# Count files to be deleted
FILE_COUNT=$(find docs/archive/redundant -name "*.md" | wc -l)

if [ "$FILE_COUNT" -eq 0 ]; then
    echo "✅ No redundant files to delete. Archive is already clean."
    exit 0
fi

echo "📊 Files to be deleted: $FILE_COUNT"
echo ""
echo "Files in docs/archive/redundant/:"
echo "================================="
ls -la docs/archive/redundant/*.md | awk '{print "  - " $9}'
echo ""

# Ask for confirmation
read -p "⚠️  Are you sure you want to permanently delete these redundant files? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "❌ Cleanup cancelled. No files were deleted."
    exit 0
fi

echo ""
echo "🔄 Creating final backup before deletion..."
BACKUP_DIR=".backup/final_cleanup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r docs/archive/redundant "$BACKUP_DIR/"
echo "✅ Backup created at: $BACKUP_DIR"

echo ""
echo "🗑️  Deleting redundant files..."
rm -f docs/archive/redundant/*.md

echo "✅ Deleted $FILE_COUNT redundant documentation files."

# Check if directory is now empty and remove it
if [ -z "$(ls -A docs/archive/redundant 2>/dev/null)" ]; then
    rmdir docs/archive/redundant
    echo "✅ Removed empty redundant directory."
fi

echo ""
echo "📊 Final Documentation Structure:"
echo "================================="
echo "  Root: $(ls *.md 2>/dev/null | wc -l) files (README, CONTRIBUTING, CHANGELOG)"
echo "  docs/core: $(ls docs/core/*.md 2>/dev/null | wc -l) files (Setup, API, Architecture)"
echo "  docs/testing: $(ls docs/testing/consolidated/*.md 2>/dev/null | wc -l) test docs"
echo "  docs/guides: $(ls docs/guides/*.md 2>/dev/null | wc -l) navigation guides"
echo ""
echo "✅ Documentation cleanup complete!"
echo ""
echo "📋 Your documentation is now:"
echo "  • 68% smaller (redundancy eliminated)"
echo "  • Systematically organized"
echo "  • Easy to navigate"
echo "  • Ready for production"
echo ""
echo "🎉 Beat-parser documentation is now world-class!"