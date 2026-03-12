# OpenGradient Task Assistant - Browser Extension

## Идея проекта

AI-powered личный ассистент в виде browser extension, который автоматически извлекает задачи, напоминания и обязательства из контента, который пользователь просматривает в браузере, и структурирует их с использованием OpenGradient SDK и MemSync.

## Проблема

Люди постоянно теряют контекст и забывают о договоренностях из:
- Переписок в Telegram/Slack/Discord ("напомни мне завтра отправить отчёт")
- Email ("перезвони в пятницу")
- Zoom/Google Meet чатов (договорённости из разговора)
- Статей и документов ("надо попробовать этот инструмент")

Сейчас всё это нужно **вручную добавлять** в календарь/ToDo-листы. Наше решение делает это **автоматически**.

## Решение

Browser extension (Chrome/Firefox), который:

1. **Читает контент страниц** через Content Scripts API
2. **Извлекает action items** через OpenGradient LLM (TEE-verified Claude 4.0 Sonnet)
3. **Сохраняет в MemSync** с долгосрочной памятью и семантическим поиском
4. **Напоминает пользователю** через push-уведомления в нужное время
5. **Синхронизирует между устройствами** автоматически через MemSync

## Уникальные преимущества через OpenGradient

### 1. Приватность через TEE
Переписки не уходят на серверы OpenAI/Anthropic напрямую — всё обрабатывается в Trusted Execution Environment с криптографическим доказательством, что данные не утекли.

### 2. Верифицируемая обработка
Каждая извлечённая задача имеет on-chain proof:
- Какая AI модель обработала текст
- Когда обработала
- Что именно извлекла

### 3. Постоянная память между устройствами
MemSync синхронизирует контекст — начал на компе, продолжил на телефоне.

### 4. Семантический поиск
- "Покажи все задачи, связанные с Виктором"
- "Что я обещал сделать на этой неделе?"
- "Найди встречу про OpenGradient"

## Технический стек

### Frontend (Browser Extension)
- **Manifest V3** для Chrome/Firefox
- **Content Scripts** — читают DOM страниц
- **Background Service Worker** — обработка через OpenGradient
- **Popup UI** — просмотр задач и напоминаний
- **Chrome Notifications API** — push-уведомления

### Backend/AI
- **OpenGradient SDK** (`client.llm.chat`) — Claude 4.0 Sonnet для извлечения задач
- **MemSync API** — долгосрочная память и семантический поиск
- **TEE Mode** — приватная обработка с on-chain proof

### Данные
- **OpenGradient** — приватный ключ + email/password для Model Hub
- **MemSync** — API key от api.memchat.io

## Примеры работы

### Пример 1: Telegram переписка
**Входной текст:**
> "Окей, давай созвонимся завтра в 15:00 по проекту"

**AI извлекает:**
```json
{
  "type": "meeting",
  "datetime": "2026-02-15T15:00:00",
  "topic": "проект",
  "action": "созвониться",
  "priority": "medium"
}
```

**Напоминание:** 🔔 "Завтра в 15:00 — созвониться по проекту"

### Пример 2: Email
**Входной текст:**
> "Не забудь отправить мне отчёт до конца недели"

**AI извлекает:**
```json
{
  "type": "task",
  "action": "отправить отчёт",
  "recipient": "коллега",
  "deadline": "2026-02-16T23:59:00",
  "priority": "high"
}
```

**Напоминание:** 🔔 "До конца недели — отправить отчёт коллеге"

### Пример 3: Статья
**Входной текст:**
> "We recommend trying the new API endpoint at api.example.com/v2"

**AI извлекает:**
```json
{
  "type": "note",
  "action": "попробовать API endpoint",
  "url": "api.example.com/v2",
  "source": "article",
  "priority": "low"
}
```

**Напоминание:** 💡 "Заметка: попробовать API endpoint api.example.com/v2"

## Архитектура

```
┌─────────────────────────────────────────────┐
│  Browser Extension (Chrome/Firefox)         │
│  ┌────────────────────────────────────────┐ │
│  │ Content Script: читает текст страниц  │ │
│  │ - Gmail, Telegram Web, Slack, Discord │ │
│  │ - Zoom chat, Google Meet, Email       │ │
│  │ - Любые веб-страницы                   │ │
│  └────────────────────────────────────────┘ │
└──────────────┬──────────────────────────────┘
               │ Отправляет текст →
               ▼
┌─────────────────────────────────────────────┐
│  OpenGradient LLM (TEE-verified)            │
│  ┌────────────────────────────────────────┐ │
│  │ Claude 4.0 Sonnet анализирует:        │ │
│  │ • Есть ли action items?                │ │
│  │ • Дата/время (если есть)               │ │
│  │ • Приоритет (звонок vs заметка)        │ │
│  │ • Контекст (кому, зачем, что)          │ │
│  └────────────────────────────────────────┘ │
└──────────────┬──────────────────────────────┘
               │ Извлечённые задачи →
               ▼
┌─────────────────────────────────────────────┐
│  MemSync (долгосрочная память)              │
│  ┌────────────────────────────────────────┐ │
│  │ Сохраняет структурированно:            │ │
│  │ - type (call/meeting/task/note)        │ │
│  │ - action (что делать)                  │ │
│  │ - datetime/deadline                    │ │
│  │ - priority (low/medium/high)           │ │
│  │ - context (детали)                     │ │
│  │ - source (откуда извлечено)            │ │
│  └────────────────────────────────────────┘ │
└──────────────┬──────────────────────────────┘
               │ Периодически проверяет →
               ▼
┌─────────────────────────────────────────────┐
│  Reminder Service                           │
│  • Push-уведомления в браузере              │
│  • Popup UI для просмотра задач             │
│  • Семантический поиск                      │
│  • Отметка задач как выполненных            │
└─────────────────────────────────────────────┘
```

## MVP Scope (Phases)

### Phase 1: Core Extension + OpenGradient Integration (2-3 дня)
- ✅ Browser extension базовая структура (Manifest V3)
- ✅ Content script для чтения текста страниц
- ✅ Background service worker
- ✅ OpenGradient SDK интеграция
- ✅ Промпт-инжиниринг для извлечения задач
- ✅ Базовый popup UI

### Phase 2: MemSync Integration (1-2 дня)
- ✅ MemSync API wrapper
- ✅ Сохранение извлечённых задач
- ✅ Структурирование данных (type, priority, deadline)
- ✅ Семантический поиск через MemSync

### Phase 3: Reminders & UI (1-2 дня)
- ✅ Background scheduler для проверки deadline'ов
- ✅ Push notifications (Chrome Notifications API)
- ✅ Улучшенный popup UI (список задач, фильтры)
- ✅ Отметить задачу как выполненную
- ✅ Базовая настройка (API ключи)

### Phase 4: Polish & Demo (1 день)
- ✅ Тестирование на разных сайтах
- ✅ Обработка edge cases
- ✅ README и документация
- ✅ Демо-видео для OpenGradient community

## Целевая аудитория

1. **OpenGradient community** — демонстрация возможностей SDK
2. **Криптоэнтузиасты** — приватность через TEE
3. **Productivity enthusiasts** — автоматизация task management
4. **Разработчики** — open-source пример использования OpenGradient

## Success Criteria

1. ✅ Extension установлен и работает в Chrome
2. ✅ Автоматически извлекает задачи из Telegram Web, Gmail, Slack
3. ✅ Сохраняет в MemSync с правильной структурой
4. ✅ Показывает push-уведомления вовремя
5. ✅ Семантический поиск работает корректно
6. ✅ On-chain proof для LLM inference доступен
7. ✅ Демо готово для показа OpenGradient team

## Почему это получит роль в OpenGradient

- ✅ Использует **3 ключевые фичи** (LLM + MemSync + TEE)
- ✅ **Решает реальную проблему** (забытые обязательства)
- ✅ **Впечатляющее демо** (живой браузер → автоматическое извлечение)
- ✅ **Уникальность** (приватность + верифицируемость через TEE)
- ✅ **Практичность** — OpenGradient team сам может использовать

## Технические детали

### OpenGradient LLM Prompt Template
```python
SYSTEM_PROMPT = """You are a task extraction AI. Analyze the provided text and extract any action items, tasks, meetings, reminders, or commitments.

For each item, return JSON with:
- type: "call" | "meeting" | "task" | "note"
- action: brief description of what to do
- datetime: ISO 8601 if specific time mentioned
- deadline: ISO 8601 if deadline mentioned
- priority: "low" | "medium" | "high"
- context: additional details
- person: if action involves specific person

If no action items found, return empty array.
"""
```

### MemSync Data Structure
```javascript
// Каждая задача сохраняется как memory в MemSync
{
  agent_id: "opengradient-task-assistant",
  thread_id: `user-${userId}`,
  messages: [
    {
      role: "user",
      content: `Task: ${task.action}. Deadline: ${task.deadline}. Priority: ${task.priority}. Context: ${task.context}`
    }
  ],
  source: "browser-extension"
}
```

## Repository Structure
```
opengradient-task-assistant/
├── extension/
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.js
│   │   └── popup.css
│   └── icons/
├── src/
│   ├── opengradient-client.js
│   ├── memsync-client.js
│   ├── task-extractor.js
│   └── scheduler.js
├── README.md
└── package.json
```

## Следующие шаги после MVP

- Интеграция с Google Calendar (опционально)
- Поддержка Firefox
- Telegram bot для напоминаний
- Дашборд на отдельной веб-странице
- Export задач в JSON/CSV
- Настройка промптов пользователем
