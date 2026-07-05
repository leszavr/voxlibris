#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════
# Voxlibris Platform — Automated Idempotent Deployment Script
# ═══════════════════════════════════════════════════════════════════════════
# Этот скрипт автоматизирует полный процесс развертывания проекта
# на чистой системе с идемпотентными операциями.
#
# Использование:
#   bash .tmp/deploy.sh [phase]
#   
# Фазы:
#   - all           (по умолчанию) — выполнить все фазы по порядку
#   - verify-env    — проверить предварительные требования
#   - setup-node    — установить/обновить Node.js до v22
#   - setup-docker  — установить Docker Engine & Compose
#   - clean-docker  — очистить Docker окружение полностью
#   - setup-env     — создать .env конфигурацию
#   - install-deps  — установить зависимости pnpm
#   - build-images  — собрать Docker образы
#   - start-services— запустить Docker контейнеры
#   - migrate-db    — применить SQL-миграции БД
#   - start-app     — запустить Backend и Frontend
#   - verify-all    — проверить все компоненты
# ═══════════════════════════════════════════════════════════════════════════

set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────
# Цвета и вывод
# ─────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}ℹ️  $*${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $*${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $*${NC}"
}

log_error() {
    echo -e "${RED}❌ $*${NC}"
}

log_section() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}$*${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

# ─────────────────────────────────────────────────────────────────────────
# Переменные
# ─────────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$(cd "$DEPLOY_DIR/../.." && pwd)"
DEPLOY_LOG="${DEPLOY_DIR}/.tmp/deploy-$(date +%Y%m%d-%H%M%S).log"
mkdir -p "${DEPLOY_DIR}/.tmp"

# ─────────────────────────────────────────────────────────────────────────
# Функции проверки
# ─────────────────────────────────────────────────────────────────────────

verify_prerequisites() {
    log_section "ФАЗА 0: Проверка предварительных требований"
    
    local os_type=$(uname -s)
    local arch=$(uname -m)
    
    log_info "Система: $os_type ($arch)"
    log_info "Директория проекта: $PROJECT_DIR"
    log_info "Логирование: $DEPLOY_LOG"
    
    # Проверка ОС
    if [[ "$os_type" != "Linux" ]]; then
        log_error "Поддерживается только Linux. Обнаружена: $os_type"
        exit 1
    fi
    
    # Проверка архитектуры
    if [[ "$arch" != "x86_64" && "$arch" != "aarch64" ]]; then
        log_error "Поддерживаются только x86_64 и aarch64. Обнаружена: $arch"
        exit 1
    fi
    
    # Проверка пакетного менеджера
    if command -v apt-get &>/dev/null; then
        log_success "Пакетный менеджер: apt-get"
    else
        log_error "apt-get не найден. Требуется Debian/Ubuntu"
        exit 1
    fi
    
    log_success "Предварительные требования выполнены"
}

# ─────────────────────────────────────────────────────────────────────────
# Node.js Setup
# ─────────────────────────────────────────────────────────────────────────

setup_nodejs() {
    log_section "ФАЗА 1.1: Установка Node.js v22+"
    
    local current_node_version=$(node --version 2>/dev/null || echo "")
    
    if [[ -n "$current_node_version" ]]; then
        log_info "Текущая версия Node: $current_node_version"
        
        # Парсинг версии
        local major_version=$(echo "$current_node_version" | cut -d. -f1 | sed 's/v//')
        
        if [[ "$major_version" -ge 22 ]]; then
            log_success "Node.js версия соответствует требованиям"
            return 0
        else
            log_warning "Node.js версия ниже v22, требуется обновление"
        fi
    else
        log_warning "Node.js не установлен"
    fi
    
    # Установка через NVM
    log_info "Установка Node.js v22 через NVM..."
    
    if ! command -v nvm &>/dev/null; then
        log_info "Установка NVM..."
        curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
        
        # Инициализация NVM для текущей сессии
        export NVM_DIR="$HOME/.nvm"
        [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    fi
    
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
    
    nvm install 22
    nvm use 22
    nvm alias default 22

    log_info "Активация pnpm@9.0.0 через Corepack..."
    corepack enable
    corepack prepare pnpm@9.0.0 --activate
    
    node --version
    npm --version
    pnpm --version
    
    log_success "Node.js v22 и pnpm@9.0.0 установлены"
}

# ─────────────────────────────────────────────────────────────────────────
# Docker Setup
# ─────────────────────────────────────────────────────────────────────────

setup_docker() {
    log_section "ФАЗА 1.2: Установка Docker Engine & Compose"
    
    if command -v docker &>/dev/null; then
        local docker_version=$(docker --version)
        log_info "Docker уже установлен: $docker_version"
        
        if docker compose version &>/dev/null; then
            log_success "Docker Compose v2 готов"
            return 0
        else
            log_warning "Docker Compose v2 не найден, установка..."
        fi
    fi
    
    log_info "Обновление пакетного индекса..."
    sudo apt-get update
    
    log_info "Установка зависимостей Docker..."
    sudo apt-get install -y \
        ca-certificates \
        curl \
        gnupg \
        lsb-release \
        apt-transport-https \
        software-properties-common
    
    log_info "Добавление GPG ключа Docker..."
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
        sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || true
    
    log_info "Добавление Docker репозитория..."
    {
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg]"
        echo "https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"
    } | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    sudo apt-get update
    
    log_info "Установка Docker Engine..."
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    log_info "Добавление пользователя в группу docker..."
    sudo usermod -aG docker "$USER" 2>/dev/null || true
    
    # Попытка активировать группу
    newgrp docker <<'ENDNEWGRP'
        docker --version
ENDNEWGRP
    
    # Также попробуем выполнить через sudo
    if ! docker ps &>/dev/null; then
        log_warning "Docker требует sudo, добавляем в sudoers..."
        echo "$USER ALL=(ALL) NOPASSWD: /usr/bin/docker" | sudo tee /etc/sudoers.d/docker > /dev/null
    fi
    
    log_success "Docker установлен"
    docker --version
    docker compose version
}

# ─────────────────────────────────────────────────────────────────────────
# Docker Cleanup
# ─────────────────────────────────────────────────────────────────────────

clean_docker_environment() {
    log_section "ФАЗА 2: Полная очистка Docker"
    
    if ! command -v docker &>/dev/null; then
        log_warning "Docker не установлен, пропуск очистки"
        return 0
    fi
    
    # Проверка флага --force для автоматического режима
    local force="${DEPLOY_FORCE:-false}"
    
    if [[ "$force" != "true" ]]; then
        log_warning "⚠️  ВНИМАНИЕ: Будут удалены все контейнеры, образы и тома!"
        read -p "Продолжить? (yes/no): " confirmation
        
        if [[ "$confirmation" != "yes" ]]; then
            log_info "Очистка отменена"
            return 0
        fi
    else
        log_info "Автоматический режим: очистка Docker без подтверждения"
    fi
    
    cd "$PROJECT_DIR"
    
    log_info "Остановка контейнеров..."
    docker compose down -v 2>/dev/null || true
    docker stop $(docker ps -aq) 2>/dev/null || true
    
    log_info "Удаление контейнеров..."
    docker rm -f $(docker ps -aq) 2>/dev/null || true
    
    log_info "Удаление томов..."
    docker volume rm $(docker volume ls -q) 2>/dev/null || true
    
    log_info "Удаление образов..."
    docker rmi $(docker images -q) 2>/dev/null || true
    
    log_info "Полная очистка системы..."
    docker system prune -af --volumes 2>/dev/null || true
    
    log_success "Docker окружение полностью очищено"
}

# ─────────────────────────────────────────────────────────────────────────
# Environment Setup
# ─────────────────────────────────────────────────────────────────────────

generate_safe_secret() {
    # Генерируем безопасный base64 secret без специальных символов для sed
    openssl rand -base64 48 | tr -dc 'A-Za-z0-9'
}

generate_hex_secret() {
    openssl rand -hex 32
}

setup_environment() {
    log_section "ФАЗА 3: Конфигурация окружения"
    
    if [[ -f "$PROJECT_DIR/.env" ]]; then
        log_warning ".env уже существует, создание резервной копии"
        cp "$PROJECT_DIR/.env" "$PROJECT_DIR/.env.backup.$(date +%Y%m%d-%H%M%S)"
        log_success "Резервная копия создана"
        return 0
    fi
    
    log_info "Создание .env файла..."
    
    # Генерация безопасных секретных ключей
    local jwt_secret=$(generate_safe_secret)
    local jwt_refresh=$(generate_safe_secret)
    local session_secret=$(generate_safe_secret)
    local master_key=$(generate_hex_secret)
    
    cat > "$PROJECT_DIR/.env" <<EOF
# ==============================================
# VoxLibris Platform — Development Environment
# ==============================================

# Application Environment
NODE_ENV=development
PORT=5000

# Database Configuration (Docker)
DATABASE_URL=postgresql://xlibris:xlibris_dev@localhost:5432/xlibris

# Security Keys - Generated for deployment
JWT_SECRET=$jwt_secret
JWT_REFRESH_SECRET=$jwt_refresh
SESSION_SECRET=$session_secret
MASTER_KEY=$master_key

# S3-Compatible Storage Configuration (Docker MinIO)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin123
S3_BUCKET=voxlibris
S3_REGION=us-east-1

# MinIO Root Credentials
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=minioadmin123

# Public URL
APP_BASE_URL=http://localhost:3000
CLIENT_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5000

# Redis Configuration (Docker)
REDIS_PASSWORD=redis_dev
REDIS_URL=redis://:redis_dev@localhost:6379
RATE_LIMIT_REDIS_URL=redis://:redis_dev@localhost:6379
RATE_LIMIT_REDIS_ENABLED=true
RATE_LIMIT_REDIS_PREFIX=rl:voxlibris

# Request/upload limits
JSON_BODY_LIMIT=15mb
URLENCODED_BODY_LIMIT=1mb
MAX_BOOK_UPLOAD_MB=50
MAX_METADATA_COVER_MB=1
MAX_BOOK_PARSE_MB=50
BOOK_PARSE_TIMEOUT_MS=15000
MAX_EPUB_ENTRY_COUNT=3000
MAX_EPUB_UNCOMPRESSED_MB=200
MAX_EPUB_TEXT_ENTRY_MB=8
MAX_EPUB_COVER_MB=10
MAX_BOOK_CHAPTERS=1500
MAX_FB2_XML_MB=20
MAX_FB2_COVER_MB=10

# Icecast Configuration
ICECAST_SOURCE_PASSWORD=dev_source_pass
ICECAST_ADMIN_PASSWORD=dev_admin_pass
ICECAST_INTERNAL_HOST=localhost
ICECAST_INTERNAL_PORT=8000
ICECAST_PUBLIC_URL=http://localhost:8000
VITE_ICECAST_PUBLIC_URL=http://localhost:8000
STUDIO_RECORDINGS_DIR=uploads/recordings
STUDIO_STREAM_INTENT_TTL_SECONDS=1800
LIVE_SESSION_TTL_SECONDS=90

# Guest access defaults
ENABLE_GUEST_ACCESS=true
MAX_ACTIVE_UPLOAD_SESSIONS=200
MAX_ACTIVE_UPLOAD_SESSIONS_PER_USER=5
UPLOAD_SESSION_TTL_MINUTES=20
UPLOAD_SESSION_CLEANUP_INTERVAL_MINUTES=5

# Postgres
POSTGRES_DB=xlibris
POSTGRES_USER=xlibris
POSTGRES_PASSWORD=xlibris_dev
EOF
    
    log_success ".env файл создан"
}

# ─────────────────────────────────────────────────────────────────────────
# Install Dependencies
# ─────────────────────────────────────────────────────────────────────────

install_dependencies() {
    log_section "ФАЗА 4: Установка зависимостей проекта"
    
    if ! command -v pnpm &>/dev/null; then
        log_error "pnpm не найден"
        exit 1
    fi
    
    cd "$PROJECT_DIR"
    
    log_info "Версия pnpm: $(pnpm --version)"
    log_info "Установка зависимостей..."
    
    pnpm install --frozen-lockfile 2>&1 | tee -a "$DEPLOY_LOG"
    
    log_success "Зависимости установлены"
}

# ─────────────────────────────────────────────────────────────────────────
# Build Docker Images
# ─────────────────────────────────────────────────────────────────────────

build_docker_images() {
    log_section "ФАЗА 5: Сборка Docker образов"
    
    log_info "Сборка Icecast образа..."
    cd "$PROJECT_DIR"
    docker compose build icecast 2>&1 | tee -a "$DEPLOY_LOG"
    
    log_success "Docker образы собраны"
    docker images | grep voxlibris || true
}

# ─────────────────────────────────────────────────────────────────────────
# Start Services
# ─────────────────────────────────────────────────────────────────────────

start_docker_services() {
    log_section "ФАЗА 6: Запуск Docker сервисов"
    
    cd "$PROJECT_DIR"
    
    log_info "Запуск контейнеров..."
    docker compose up -d 2>&1 | tee -a "$DEPLOY_LOG"
    
    log_info "Ожидание инициализации сервисов (30 сек)..."
    sleep 30
    
    log_info "Статус контейнеров:"
    docker compose ps
    
    # Проверка здоровья
    log_info "Проверка здоровья сервисов..."
    
    for i in {1..5}; do
        log_info "Попытка $i..."
        if docker compose ps | grep -q "healthy"; then
            log_success "Сервисы инициализировались"
            break
        fi
        sleep 5
    done
    
    log_success "Docker сервисы запущены"
}

# ─────────────────────────────────────────────────────────────────────────
# Migrate Database
# ─────────────────────────────────────────────────────────────────────────

migrate_database() {
    log_section "ФАЗА 7: Миграция БД"
    
    log_info "Ожидание готовности PostgreSQL (10 сек)..."
    sleep 10
    
    if [[ ! -f "$PROJECT_DIR/script/run-all-migrations.ts" ]]; then
        log_error "Не найден $PROJECT_DIR/script/run-all-migrations.ts"
        exit 1
    fi

    log_info "Применение миграций через script/run-all-migrations.ts..."
    cd "$PROJECT_DIR"
    pnpm exec tsx script/run-all-migrations.ts 2>&1 | tee -a "$DEPLOY_LOG"
    
    log_success "Миграции БД применены"
}

# ─────────────────────────────────────────────────────────────────────────
# Verification
# ─────────────────────────────────────────────────────────────────────────

verify_all_services() {
    log_section "ФАЗА 8: Верификация всех сервисов"
    
    local failed=0
    
    # Проверка портов
    local ports=(3000 5000 5432 6379 8000 9000 9001 4010)
    
    for port in "${ports[@]}"; do
        if nc -zw1 localhost "$port" 2>/dev/null; then
            log_success "Порт $port: доступен"
        else
            log_warning "Порт $port: недоступен"
            ((failed++))
        fi
    done
    
    # Проверка Docker контейнеров
    log_info ""
    log_info "Статус Docker контейнеров:"
    docker compose ps
    
    if [[ $failed -eq 0 ]]; then
        log_success "Все сервисы проверены успешно!"
    else
        log_warning "$failed сервисов недоступны"
    fi
}

# ─────────────────────────────────────────────────────────────────────────
# Show Summary
# ─────────────────────────────────────────────────────────────────────────

show_summary() {
    log_section "🎉 РАЗВЕРТЫВАНИЕ ЗАВЕРШЕНО"
    
    echo -e "${GREEN}Доступные сервисы:${NC}"
    echo "  🌐 Frontend:     http://localhost:3000"
    echo "  🔧 Backend API:  http://localhost:5000"
    echo "  🗄️  PostgreSQL:   localhost:5432"
    echo "  📦 MinIO:        http://localhost:9000"
    echo "  📦 MinIO Console: http://localhost:9001"
    echo "  🔴 Redis:        localhost:6379"
    echo "  🎙️  Icecast:      http://localhost:8000"
    echo "  💳 YooKassa:     http://127.0.0.1:4010"
    echo ""
    
    echo -e "${GREEN}Команды управления:${NC}"
    echo "  Старт:       ./xlibris-manager.sh start"
    echo "  Статус:      ./xlibris-manager.sh status"
    echo "  Остановка:   ./xlibris-manager.sh stop"
    echo "  Перезапуск:  ./xlibris-manager.sh restart"
    echo ""
    
    echo -e "${CYAN}Логи развертывания:${NC}"
    echo "  $DEPLOY_LOG"
    echo ""
    
    log_success "Система готова к использованию!"
}

# ─────────────────────────────────────────────────────────────────────────
# Start Application
# ─────────────────────────────────────────────────────────────────────────

start_application() {
    log_section "ФАЗА 9: Запуск приложения"
    
    log_info "Запуск Backend и Frontend через xlibris-manager.sh..."
    cd "$PROJECT_DIR"
    
    # Запускаем менеджер в фоновом режиме
    bash xlibris-manager.sh start &
    local manager_pid=$!
    
    log_info "Ожидание запуска приложения (60 сек)..."
    local elapsed=0
    while [[ $elapsed -lt 60 ]]; do
        if nc -zw1 localhost 5000 2>/dev/null && nc -zw1 localhost 3000 2>/dev/null; then
            log_success "Приложение запущено"
            return 0
        fi
        sleep 5
        elapsed=$((elapsed + 5))
    done
    
    log_warning "Таймаут ожидания приложения, проверяем статус..."
    bash xlibris-manager.sh status 2>&1 || true
}

# ─────────────────────────────────────────────────────────────────────────
# Create Superadmin
# ─────────────────────────────────────────────────────────────────────────

create_superadmin() {
    log_section "ФАЗА 10: Создание суперадмина"
    
    log_info "Запуск скрипта создания суперадмина..."
    log_info "Введите данные для создания суперадмина:"
    cd "$SCRIPT_DIR"
    
    if [[ ! -f "create-superadmin.sh" ]]; then
        log_error "Скрипт create-superadmin.sh не найден"
        return 1
    fi
    
    # Всегда интерактивный режим - пользователь вводит данные
    bash create-superadmin.sh
    
    if [[ $? -eq 0 ]]; then
        log_success "Суперадмин создан"
    else
        log_error "Ошибка создания суперадмина"
        return 1
    fi
}

# ─────────────────────────────────────────────────────────────────────────
# Main Execution
# ─────────────────────────────────────────────────────────────────────────

main() {
    local phase="${1:-all}"
    
    log_section "Voxlibris Platform — Automated Deployment v1.0"
    
    # Автоматический режим для фазы all
    if [[ "$phase" == "all" ]]; then
        export DEPLOY_FORCE=true
    fi
    
    case "$phase" in
        verify-env)
            verify_prerequisites
            ;;
        setup-node)
            setup_nodejs
            ;;
        setup-docker)
            setup_docker
            ;;
        clean-docker)
            clean_docker_environment
            ;;
        setup-env)
            setup_environment
            ;;
        install-deps)
            install_dependencies
            ;;
        build-images)
            build_docker_images
            ;;
        start-services)
            start_docker_services
            ;;
        migrate-db)
            migrate_database
            ;;
        start-app)
            start_application
            ;;
        create-superadmin)
            create_superadmin
            ;;
        verify-all)
            verify_all_services
            ;;
        all|*)
            verify_prerequisites
            setup_nodejs
            setup_docker
            clean_docker_environment
            setup_environment
            install_dependencies
            build_docker_images
            start_docker_services
            migrate_database
            start_application
            create_superadmin
            show_summary
            ;;
    esac
    
    echo ""
    log_success "Фаза выполнена: $phase"
}

# Запуск
main "$@"
