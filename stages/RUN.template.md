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
| P / Esc | пауза + меню настроек (игрок, монстр, окружение, камера, объектив) |
| M | звук вкл/выкл |

Перезапуск сцены: клавиша **R** или перезагрузка страницы.
URL-параметры: `?seed=N`, `?debug=1`, `?waves=0` (песочница без волн), `?paused=1`, `?mute=1` (без звука).
Визуальные настройки (то же, что в меню паузы; запоминаются в localStorage): `?all=new` (все новые ассеты), `?player=classic|vanguard`, `?monster=classic|reaver`, `?env=classic|kit2`, `?cam=ortho|persp`, `?fov=6..30` (вертикальный угол объектива слабой перспективы, по умолчанию 14° ≈ 98 мм).
Звук включается после первого клика или нажатия клавиши (политика автозапуска браузеров).

## Машинный доступ
В консоли браузера: `__game.state()`, `__game.errors()`, `__game.visibility()`, `__game.coverage()`,
`__game.pause()`, `__game.step(n)`, `__game.reset({seed, waves, player})`, `__game.aimAt(x,z)`, `__game.fire()`, `__game.move(x,y)`,
`__game.worldToScreen(x,z)`, `__game.scene()`, `__game.audio.*` (info/mute/volume/peak), `__game.settings.*` (get/set/menu/active), `__game.camera()`, `__game.assets()`, `__game.debug.*`.

## Пересборка из исходников
```
mkdir src-build && tar -xf source.zip -C src-build && cd src-build   # или распаковать любым zip-архиватором
npm ci
npm run build        # -> dist/
npm test             # юнит-тесты симуляции (vitest)
npm run assets       # (необязательно) перегенерировать GLB-ассеты из assetgen/specs/*.json через headless Blender 4.5.14
                     # Blender берётся из $BLENDER или скачивается автоматически в ~/.cache/b02-tools; готовые GLB уже лежат в public/
node tests/e2e.mjs --dir dist --out evidence/check --stage {{STAGE}}   # e2e в системном Chrome (playwright-core)
```
