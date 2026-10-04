# {{NAME}} — запуск

## Требования
- Node.js ≥ 18 (только для встроенного статического сервера, без `npm install`).
- Браузер с WebGL2: Chrome / Edge (рекомендуется), Firefox.
- Альтернатива Node: любой статический сервер, напр. `python -m http.server 8080 -d web`.

## Запуск
```
node serve.mjs            # из папки распакованного архива; сервер отдаёт ./web
```
Windows: двойной клик `run.bat` (сам откроет браузер). Linux/macOS: `sh run.sh`.

Адрес: **http://localhost:8080/**  (другой порт: `node serve.mjs web 9000`).

## Управление
| Ввод | Действие |
|---|---|
| W / S | вверх / вниз по экрану |
| A / D | влево / вправо по экрану |
| Мышь | прицел (оружие целится в точку под курсором) |
| ЛКМ (удерживать) | стрельба |
| R | перезапуск сцены (тот же seed) |
| F3 или ` | debug-оверлей: причины видимости, состояние |
| Esc или P | пауза + меню настроек (HD-игрок / HD-монстр / HD-окружение, камера: изометрия или слабая перспектива, объектив 85/135/200 мм) |
| M | звук вкл/выкл |

Перезапуск сцены: клавиша **R** или перезагрузка страницы.
URL-параметры: `?seed=N`, `?debug=1`, `?waves=0` (песочница без волн), `?paused=1`, `?mute=1` (без звука), `?hd=1` (всё HD), `?player=hd`, `?monster=hd`, `?env=hd`, `?camera=persp`, `?focal=135`. Настройки из меню сохраняются в браузере.
Звук включается после первого клика или нажатия клавиши (политика автозапуска браузеров).

## Машинный доступ
В консоли браузера: `__game.state()`, `__game.errors()`, `__game.visibility()`, `__game.coverage()`,
`__game.pause()`, `__game.step(n)`, `__game.reset({seed, waves, player})`, `__game.aimAt(x,z)`, `__game.fire()`, `__game.move(x,y)`,
`__game.worldToScreen(x,z)`, `__game.scene()`, `__game.audio.*` (info/mute/volume/peak), `__game.debug.*`.

## Пересборка из исходников
```
mkdir src-build && tar -xf source.zip -C src-build && cd src-build   # или распаковать любым zip-архиватором
npm ci
npm run build        # -> dist/
npm test             # юнит-тесты симуляции (vitest)
node tests/e2e.mjs --dir dist --out evidence/check --stage {{STAGE}}   # e2e в системном Chrome (playwright-core)
```
