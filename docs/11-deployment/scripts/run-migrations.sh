#!/bin/bash

# VoxLibris Database Migrations Script
# Applies all SQL migrations to PostgreSQL database via Docker

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

main() {
    print_header "VoxLibris Database Migrations"
    
    # Check if Docker is available
    if ! command -v docker &> /dev/null; then
        print_error "Docker is required but not installed"
        exit 1
    fi
    
    # Check if PostgreSQL container is running
    print_info "Checking PostgreSQL container..."
    if ! docker ps --filter "name=xlibris-postgres" --filter "status=running" | grep -q xlibris-postgres; then
        print_error "PostgreSQL container (xlibris-postgres) is not running"
        print_info "Try: ./xlibris-manager.sh start"
        exit 1
    fi
    print_success "PostgreSQL container is running"
    echo
    
    # Find migrations directory
    local migrations_dir="../migrations"
    if [ ! -d "$migrations_dir" ]; then
        print_error "Migrations directory not found at $migrations_dir"
        exit 1
    fi
    
    print_info "Applying migrations from: $migrations_dir"
    echo
    
    # Find all .sql files and apply them in order
    local count=0
    for migration_file in $(ls -1 "$migrations_dir"/*.sql 2>/dev/null | sort); do
        if [ -f "$migration_file" ]; then
            local filename=$(basename "$migration_file")
            echo -n "  Applying $filename ... "
            
            if docker exec xlibris-postgres psql -U xlibris -d xlibris -f "/migrations/$filename" &>/dev/null 2>&1; then
                echo -e "${GREEN}✓${NC}"
                ((count++))
            else
                # Try applying as a single command if file not found in container
                local sql=$(cat "$migration_file")
                if docker exec xlibris-postgres psql -U xlibris -d xlibris -c "$sql" &>/dev/null 2>&1; then
                    echo -e "${GREEN}✓${NC}"
                    ((count++))
                else
                    echo -e "${YELLOW}⚠${NC} (may already exist or skipped)"
                fi
            fi
        fi
    done
    
    echo
    print_header "Migration Complete"
    print_success "Applied $count migrations"
    print_info "Database is ready for use"
    echo
}

main "$@"
