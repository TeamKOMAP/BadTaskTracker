# GoodTaskTracker

Мозг особо не ебите так чисто поспрашивайте 
![Мозг особо не ебите так чисто поспрашивайте ](https://github.com/TeamKOMAP/GoodTaskTracker/blob/main/%D0%A4%D0%90.jpg)


Веб-приложение для создания, учета и контроля задач с базовой отчетностью. Учебный проект для практикантов.

## Требования к окружению

Перед запуском убедитесь, что установлены:

1. **.NET 8.0+ SDK**
   - [Скачать с официального сайта](https://dotnet.microsoft.com/download)
   - Проверить установку: `dotnet --version`

2. **IDE**

3. **Git**

4. **Любой браузер**

## 🗂️ Структура проекта (BACKEND)

```text
TaskTracker/
│
├── TaskTracker.API/ # Presentation Layer (API)
│ ├── Controllers/ # Контроллеры Web API
│ ├── Program.cs # Точка входа
│ └── appsettings.json # Конфигурация
│
├── TaskTracker.Application/ # Application Layer
│ ├── Services/ # Сервисы приложения
│ ├── DTOs/ # Data Transfer Objects
│ ├── Mappings/ # AutoMapper профили
│ └── Validators/ # FluentValidation
│
├── TaskTracker.Domain/ # Domain Layer
│ ├── Entities/ # Доменные модели
│ ├── Enums/ # Перечисления
│ └── Interfaces/ # Интерфейсы репозиториев
│
├── TaskTracker.Infrastructure/ # Data Access Layer
│ ├── Data/ # DbContext
│ ├── Migrations/ # Миграции БД
│ └── Repositories/ # Репозитории (если используются)
│
├── TaskTracker.Tests/ # Тесты
│ ├── UnitTests/ # Модульные тесты
│ ├── IntegrationTests/ # Интеграционные тесты
│ └── TestHelpers/ # Вспомогательные классы
│
├── README.md # Это тут щас
└── TaskTracker.sln
```
## 🚀 Запуск проекта (локально)

### Способ 1: Через Visual Studio (рекомендуется)
1. **Клонируйте репозиторий:**
   ```bash
   git clone <URL-репозитория>
   cd TaskTracker
   ```

2. **Зависимости (курить охота):**
   ```bash
   dotnet restore
   ```

3. **Миграции БД:**
   ```bash
   dotnet ef database update --project TaskTracker.Infrastructure --startup-project TaskTracker.API
   ```
   ЛИБО через Package Manager Console в VS:
   ```powershell
   Update-Database
   ```

4. **Запуск приложения:**
   ```bash
   dotnet run --project TaskTracker.API
   ```
   либо через F5 в VS

## 💯 КАК СДЕЛАТЬ СВАГУ? (Swagger)
НИКАК БЛЯТЬ ЭТО ПРОСТО API БЛЯТЬЯЯТЯТЯЬЯТ
1. После запуска приложения откройте браузер
2. Перейдите по адресу: `/swagger`
3. В Swagger UI вы можете:
   - Просматривать все доступные эндпоинты API
   - Тестировать API напрямую через интерфейс
   - Видеть модели данных для запросов и ответов

## ❓ И че будет?:
При первом запуске будет создана база данных SQLite с таблицами:

- Users (пользователи)
- Tasks (задачи)
- Tags (теги)
- TaskTags (связь задач и тегов)
