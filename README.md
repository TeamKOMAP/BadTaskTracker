# TaskManager

[![.NET CI](https://github.com/TeamKOMAP/BadTaskTracker/actions/workflows/dotnet.yml/badge.svg)](https://github.com/TeamKOMAP/BadTaskTracker/actions)

Веб-приложение для создания, учета и контроля задач с базовой отчетностью. Учебный проект для практикантов.

**Ключевые возможности:**
- Управление задачами в рамках рабочих пространств (Workspaces)
- Система ролей и прав доступа (Owner, Admin, Member)
- Фильтрация и отчетность
- JWT аутентификация
- REST API с документацией Swagger

## 📝 Требования к окружению

Перед запуском убедитесь, что установлены:

1. **.NET 8.0+ SDK**
   - [Скачать с официального сайта](https://dotnet.microsoft.com/download)
   - Проверить установку: `dotnet --version`

2. **IDE**

3. **Git**

4. **Любой браузер**

## ⚙️ Структура проекта (BACK-END)

```text
TaskManager/
│
├── TaskManager.API/               # Presentation Layer (API)
│ ├── Controllers/                 # Контроллеры Web API
│ ├── Security/                    # Авторизация и контекст запросов
│ ├── Program.cs                   # Точка входа
│ └── appsettings.json             # Конфигурация
│
├── TaskManager.Application/       # Application Layer
│ ├── Services/                    # Сервисы приложения
│ ├── DTOs/                        # Data Transfer Objects
│ ├── Interfaces/                  # Интерфейсы сервисов
│ └── Exceptions/                  # Кастомные исключения
│
├── TaskManager.Domain/            # Domain Layer
│ ├── Entities/                    # Доменные модели
│ ├── Enums/                       # Перечисления
│ └── Enums/                       # WorkspaceRole и др.
│
├── TaskManager.Infrastructure/    # Data Access Layer
│ ├── Data/                        # DbContext
│ ├── Migrations/                  # Миграции БД
│ ├── Repositories/                # Репозитории
│ └── Storage/                     # Хранилище вложений
│
├── TaskManager.Tests/             # Интеграционные тесты
│ ├── IntegrationTests/            # Тесты API
│ └── Helpers/                     # Вспомогательные классы
│
├── README.md
├── DEFINITION_OF_DONE.md          # Критерии готовности задач
└── TaskManager.sln
```

## 🖼 Структура проекта (FRONT-END) 

```text
TaskTracker.API/wwwroot/ # Статические файлы фронтенда
│
├── index.html           # Главная страница
├── css/
│ ├── styles.css         # Основные стили
│ ├── layout.css         # Стили макета
│ └── components.css     # Стили компонентов
│
├── js/
│ ├── app.js             # Главный файл приложения
│ ├── api.js             # Функции для работы с API
│ ├── tasks.js           # Логика работы с задачами
│ ├── filters.js         # Логика фильтрации
│ ├── reports.js         # Логика отчётов
│ └── utils.js           # Вспомогательные функции
│
├── pages/               # Дополнительные страницы (опционально)
│ ├── create-task.html   # Страница создания задачи
│ ├── файл 
│ ├── файл
│ └── reports.html       # Страница отчётов
│
└── assets/            # Ресурсы
├── icons/             # Иконки
└── images/            # Изображения
```

## 🚀 Запуск проекта (локально)

1. **Клонируйте репозиторий:**
   ```bash
   git clone https://github.com/TeamKOMAP/BadTaskTracker.git
   cd BadTaskTracker
   ```

2. **Восстановление зависимостей:**
   ```bash
   dotnet restore
   ```

3. **Применение миграций БД:**
   ```bash
   dotnet ef database update --project TaskManager.Infrastructure --startup-project TaskManager.API
   ```
   ЛИБО через Package Manager Console в VS:
   ```powershell
   Update-Database
   ```

4. **Запуск приложения:**
   ```bash
   dotnet run --project TaskManager.API
   ```
   Или через F5 в Visual Studio
   
    Приложение будет доступно по адресам:
    - API: `https://localhost:5001` или `http://localhost:5000`
    - Swagger UI: `/swagger`

## 📧 SMTP и .env

Для отправки кодов входа по email заполните SMTP-секреты в локальном `.env` (файл в корне проекта, в git не коммитится):

```env
Smtp__Username=your-smtp-username
Smtp__Password=your-smtp-password
Smtp__FromEmail=your-from-email
```

Дополнительно можно настроить таймаут отправки:

```env
Smtp__TimeoutSeconds=10
```

Ограничение на смену ника (по умолчанию раз в 3 часа):

```env
Profile__NicknameChangeCooldownHours=3
```

Шаблон переменных: `.env.example`.

## 💯 КАК СДЕЛАТЬ (Swagger)?

1. После запуска приложения откройте браузер
2. Перейдите по адресу: `/swagger`
3. В Swagger UI вы можете:
   - Просматривать все доступные эндпоинты API
   - Тестировать API напрямую через интерфейс
   - Видеть модели данных для запросов и ответов

## 🧪 Запуск тестов

Проект содержит интеграционные тесты для API:

```bash
# Запуск всех тестов
dotnet test

# Запуск с подробным выводом
dotnet test --verbosity normal

# Запуск конкретного теста
dotnet test --filter "FullyQualifiedName~TasksApiTests"
```

Тесты используют:
- **WebApplicationFactory** для интеграционного тестирования
- **InMemory Database** для изоляции тестов
- **xUnit + FluentAssertions** для проверок

## 🔐 Аутентификация и авторизация

API использует JWT токены и контекст запросов. Для тестирования через Swagger или curl необходимо передавать заголовки:

```http
X-Actor-UserId: 1          # ID пользователя
X-Workspace-Id: 1          # ID рабочего пространства
Authorization: Bearer {token}  # JWT токен (если требуется)
```

Пример запроса:
```bash
curl -X GET "http://localhost:5000/api/Tasks" \
  -H "X-Actor-UserId: 1" \
  -H "X-Workspace-Id: 1"
```

## ❓ Что произойдёт?

При первом запуске будет создана база данных SQLite со следующей структурой:

**Основные сущности:**
- **Users** - Пользователи системы
- **Workspaces** - Рабочие пространства (проекты)
- **WorkspaceMembers** - Члены воркспейса с ролями (Owner, Admin, Member)
- **Tasks** - Задачи (привязаны к воркспейсу)
- **Tags** - Теги (в рамках воркспейса)
- **TaskTags** - Связь задач и тегов (many-to-many)
- **TaskAttachments** - Вложения к задачам

## 📋 Definition of Done

Перед сдачей задачи обязательно проверить [DEFINITION_OF_DONE.md](./DEFINITION_OF_DONE.md)

## 👥 Команда

- **Backend** - Разработка API и бизнес-логики
- **Frontend** - Разработка пользовательского интерфейса  
- **QA/DevOps** - Тестирование, CI/CD, контроль качества

## 📄 Лицензия

Учебный проект. Все права принадлежат команде разработчиков.
