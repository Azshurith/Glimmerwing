# --------------------------------------------------
# 🌍 Load Environment Variables
# --------------------------------------------------
-include .env

# --------------------------------------------------
# 🐳 Project Lifecycle Commands
# --------------------------------------------------

project_setup:         ## 📝 Create .env from .env.sample (then change the passwords)
	@test -f .env && echo ".env already exists" || (cp .env.sample .env && echo "Created .env: change the passwords")

project_start:         ## 🚀 Start all containers in detached mode
	docker compose up -d

project_build:         ## 🏗️ Rebuild the images and start
	docker compose up -d --build

project_stop:          ## 🛑 Stop all running containers
	docker compose stop

project_restart:       ## 🔄 Restart all containers
	docker compose restart

project_logs:          ## 📜 Follow the game server's log
	docker compose logs -f node

project_destroy:       ## 💣 Remove containers and volumes (deletes the database!)
	docker compose down -v

# --------------------------------------------------
# 🎮 Node (game) Commands
# --------------------------------------------------

node_shell:            ## 🔧 Open a shell in the Node container
	docker exec -it -u root ${PROJECT_NAME}-node /bin/bash

node_install:          ## 📦 Install packages
	docker exec -it -u root ${PROJECT_NAME}-node npm install

node_build:            ## 🏗️ Rebuild dist/ (the server serves the new page on the next load)
	docker exec -it -u root ${PROJECT_NAME}-node npm run build

node_check:            ## ✅ Typecheck, lint and format check
	docker exec -it -u root ${PROJECT_NAME}-node npm run check

node_restart:          ## 🔄 Rebuild and restart the game server
	docker compose restart node

# --------------------------------------------------
# 🗄️ MariaDB Commands
# --------------------------------------------------

db_shell:              ## 🗄️ Open a MariaDB prompt on the game's database
	docker exec -it ${PROJECT_NAME}-mariadb mariadb -u${MARIADB_USERNAME} -p${MARIADB_PASSWORD} ${MARIADB_DATABASE}

db_dump:               ## 💾 Dump the database to backup.sql
	docker exec ${PROJECT_NAME}-mariadb mariadb-dump -u${MARIADB_USERNAME} -p${MARIADB_PASSWORD} ${MARIADB_DATABASE} > backup.sql

# --------------------------------------------------
# 📖 Help
# --------------------------------------------------
help:  ## 📖 Show this help menu
	@echo "╔══════════════════════════════════════════════════════════════════════════════╗"
	@echo "║                          🛠️  Make Commands Help                               ║"
	@echo "╠══════════════════════════════════════════════════════════════════════════════╣"
	@awk -F':.*?## ' '/^[a-zA-Z0-9_-]+:.*?## / { printf "║ 	\033[36m%-20s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@echo "╚══════════════════════════════════════════════════════════════════════════════╝"
