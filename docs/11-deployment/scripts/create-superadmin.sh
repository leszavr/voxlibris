#!/bin/bash

# VoxLibris Superadmin Creation Script
# Creates a superadmin (admin role) user with bcrypt-hashed password
# Connects to PostgreSQL via Docker and inserts user and profile

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}" >&2
    echo -e "${BLUE}$1${NC}" >&2
    echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}" >&2
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}" >&2
}

print_error() {
    echo -e "${RED}❌ $1${NC}" >&2
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}" >&2
}

# Validate password requirements
validate_password() {
    local password="$1"
    local length=${#password}
    
    # Check minimum length
    if [ "$length" -lt 8 ]; then
        print_error "Password must be at least 8 characters long (current: $length)"
        return 1
    fi
    
    # Check for lowercase letters
    if ! [[ "$password" =~ [a-z] ]]; then
        print_error "Password must contain at least one lowercase letter (a-z)"
        return 1
    fi
    
    # Check for uppercase letters
    if ! [[ "$password" =~ [A-Z] ]]; then
        print_error "Password must contain at least one uppercase letter (A-Z)"
        return 1
    fi
    
    # Check for numbers
    if ! [[ "$password" =~ [0-9] ]]; then
        print_error "Password must contain at least one number (0-9)"
        return 1
    fi
    
    # Check for special characters - look for anything that's not alphanumeric
    if [[ "$password" =~ ^[a-zA-Z0-9]*$ ]]; then
        print_error "Password must contain at least one special character (!@#\$%^*()_+-=[]{}';:\"\\|,.<>/?)"
        return 1
    fi
    
    return 0
}

# Read and validate username
read_username() {
    local username=""
    while [ -z "$username" ]; do
        echo -e "${YELLOW}Enter superadmin username:${NC}" >&2
        read -rp "  username > " username
        if [ -z "$username" ]; then
            echo -e "${RED}❌ Username cannot be empty${NC}" >&2
        fi
    done
    echo "$username"
}

# Read and validate email
read_email() {
    local email=""
    local email_regex="^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"
    
    while [ -z "$email" ]; do
        echo -e "${YELLOW}Enter superadmin email:${NC}" >&2
        read -rp "  email > " email
        if [ -z "$email" ]; then
            echo -e "${RED}❌ Email cannot be empty${NC}" >&2
            email=""
        elif ! [[ $email =~ $email_regex ]]; then
            echo -e "${RED}❌ Invalid email format${NC}" >&2
            email=""
        fi
    done
    echo "$email"
}

# Read and validate password
read_password() {
    local password=""
    local password_confirm=""
    
    # Check if password passed as argument (for automation)
    if [ $# -gt 0 ]; then
        password="$1"
        password_confirm="$1"
    else
        while true; do
            echo -e "${YELLOW}Enter superadmin password:${NC}" >&2
            echo -e "${YELLOW}Requirements:${NC}" >&2
            echo "  • Minimum 8 characters" >&2
            echo "  • At least one lowercase letter (a-z)" >&2
            echo "  • At least one uppercase letter (A-Z)" >&2
            echo "  • At least one number (0-9)" >&2
            echo "  • At least one special character (!@#\$%^*()_+-=[]{}';:\"\\|,.<>/?)" >&2
            
            echo -n "  Password: " >&2
            read -rs password
            echo >&2
            
            if ! validate_password "$password"; then
                echo >&2
                continue
            fi
            
            echo -n "  Confirm password: " >&2
            read -rs password_confirm
            echo >&2
            
            if [ "$password" != "$password_confirm" ]; then
                print_error "Passwords do not match"
                echo >&2
                continue
            fi
            
            break
        done
    fi
    
    if ! validate_password "$password"; then
        return 1
    fi
    
    echo "$password"
}

# Generate bcrypt hash using Node.js
generate_bcrypt_hash() {
    local password="$1"
    
    # Check if node is available
    if ! command -v node &> /dev/null; then
        print_error "Node.js is required but not installed"
        return 1
    fi
    
    # Use bcrypt to hash password via environment variable to avoid shell interpretation
    local hash=$(PASS_TO_HASH="$password" node -e "
        const bcrypt = require('bcrypt');
        const password = process.env.PASS_TO_HASH;
        if (!password) {
            console.error('Password not provided');
            process.exit(1);
        }
        const hash = bcrypt.hashSync(password, 10);
        console.log(hash);
    " 2>/dev/null)
    
    if [ -z "$hash" ]; then
        print_error "Failed to generate bcrypt hash"
        return 1
    fi
    
    echo "$hash"
}

# Check database connection via Docker
check_db_connection() {
    if ! docker exec xlibris-postgres psql -U xlibris -d xlibris -c "SELECT 1;" &>/dev/null 2>&1; then
        return 1
    fi
    return 0
}

# Insert user and profile into database via Docker
insert_user() {
    local username="$1"
    local email="$2"
    local password_hash="$3"
    
    # Escape single quotes in password hash for SQL
    local escaped_hash="${password_hash//\'/\'\'}"
    local escaped_username="${username//\'/\'\'}"
    local escaped_email="${email//\'/\'\'}"
    
    # SQL to insert user
    local sql_user="
    INSERT INTO users (username, email, password, role, status, email_confirmed, created_at)
    VALUES ('$escaped_username', '$escaped_email', '$escaped_hash', 'admin', 'active', true, NOW())
    ON CONFLICT (email) DO UPDATE SET
      password = EXCLUDED.password,
      role = 'admin',
      status = 'active',
      email_confirmed = true
    RETURNING id;
    "
    
    # Get user ID
    local user_id=$(docker exec xlibris-postgres psql -U xlibris -d xlibris -t -c "$sql_user" 2>&1 | grep -o '[a-f0-9\-]*' | head -1)
    
    if [ -z "$user_id" ]; then
        print_error "Failed to insert user"
        return 1
    fi
    
    # SQL to insert user profile
    local sql_profile="
    INSERT INTO user_profiles (user_id, display_name, is_reader, created_at)
    VALUES ('$user_id', 'Administrator', false, NOW())
    ON CONFLICT (user_id) DO NOTHING;
    "
    
    docker exec xlibris-postgres psql -U xlibris -d xlibris -c "$sql_profile" &>/dev/null
    
    echo "$user_id"
}

# Main script
main() {
    print_header "VoxLibris Superadmin Creation Tool"
    
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
    
    # Check database connection
    print_info "Checking database connection..."
    if ! check_db_connection; then
        print_error "Cannot connect to database"
        exit 1
    fi
    print_success "Database connection OK"
    echo
    
    # Gather user input
    print_header "Superadmin Credentials"
    
    local username=$(read_username)
    echo
    
    local email=$(read_email)
    echo
    
     # Try to read password from stdin first (for automation), otherwise interactive
     local password=""
     if [ -t 0 ]; then
         # Interactive mode
         password=$(read_password)
     else
         # Piped mode - read from stdin (raw mode to avoid interpreting escapes)
         read -r password
         if ! validate_password "$password"; then
             print_error "Invalid password provided"
             exit 1
         fi
     fi
    echo
    
    # Generate bcrypt hash
    print_info "Generating bcrypt hash..."
    local password_hash=$(generate_bcrypt_hash "$password")
    if [ $? -ne 0 ]; then
        print_error "Failed to generate password hash"
        exit 1
    fi
    print_success "Password hash generated"
    echo
    
    # Insert user
    print_info "Creating superadmin user..."
    local user_id=$(insert_user "$username" "$email" "$password_hash")
    if [ $? -ne 0 ] || [ -z "$user_id" ]; then
        print_error "Failed to create superadmin user"
        exit 1
    fi
    print_success "Superadmin user created"
    echo
    
    # Summary
    print_header "✅ Superadmin Created Successfully"
    echo -e "${GREEN}User ID:${NC}    $user_id"
    echo -e "${GREEN}Username:${NC}   $username"
    echo -e "${GREEN}Email:${NC}      $email"
    echo -e "${GREEN}Role:${NC}       admin"
    echo -e "${GREEN}Status:${NC}     active"
    echo
    print_info "You can now login with:"
    echo "  Email: $email"
    echo "  Password: [the password you entered]"
    echo
    print_info "Frontend: http://localhost:3000"
    echo
}

# Run main
main "$@"
