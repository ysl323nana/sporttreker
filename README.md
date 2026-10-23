REST API на Node.js без внешних зависимостей. Данные хранятся в файле `db.json`, который создаётся при первом запросе на запись.
1. Установите Node.js 18 или новее.
2. В папке проекта выполните `node server.js`.
3. Откройте http://localhost:3000. Другой порт: `PORT=8080 node server.js`.
Если в папке `public` лежит `index.html`, сервер отдаёт клиентскую часть по адресу http://localhost:3000.
После регистрации или входа приходит `token`. Передавайте его в каждом запросе: `Authorization: Bearer <token>`.
| Метод | Путь | Что делает |
|---|---|---|
| POST | /api/auth/register | Регистрация: name, email, password |
| POST | /api/auth/login | Вход: email, password |
| POST | /api/auth/logout | Выход |
| GET | /api/me | Мой профиль |
| GET | /api/users | Список пользователей |
| GET | /api/users/:id | Профиль пользователя |
| PUT | /api/users/:id | Изменить свой профиль |
| DELETE | /api/users/:id | Удалить свой аккаунт |
| GET | /api/exercises?q=&group= | Поиск упражнений |
| GET | /api/exercises/:id | Упражнение с инструкцией и видео |
| GET | /api/workouts | Мои тренировки |
| POST | /api/workouts | Создать тренировку: name, date |
| GET | /api/workouts/:id | Одна тренировка |
| PUT | /api/workouts/:id | Изменить name, date |
| DELETE | /api/workouts/:id | Удалить тренировку |
| POST | /api/workouts/:id/exercises | Добавить упражнение: exerciseId |
| DELETE | /api/workouts/:id/exercises/:itemId | Убрать упражнение |
| PUT | /api/workouts/:id/exercises/:itemId/result | Записать результат: reps, weight, time, dist |
| GET | /api/stats | Моя статистика и достижения |
| GET | /api/rating | Общий рейтинг |
- Упражнение с результатом даёт 10 очков, плюс 1 за повторение, 1 за минуту и 1 за каждые 100 м.
- Каждые 100 очков дают новый уровень.
Пароли хранятся в виде кэша. Пользователь видит и меняет только свои данные.