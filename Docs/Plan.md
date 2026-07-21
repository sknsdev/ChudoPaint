# ChudoPaint — roadmap разработки

ChudoPaint — open-source растровый редактор для Windows, macOS и Linux на
Tauri, React, TypeScript и Rust. Цель — понятный Paint-подобный workflow с
прозрачными слоями, а не замена профессиональным PSD/CMYK-редакторам.

Этот документ — живой технический roadmap. В нём отмечаются только
действительно готовые функции; идея, тип или частичный прототип не считаются
завершённой задачей.

## Текущий статус — 0.2.0

Готов технический preview:

- [x] Tauri + React + TypeScript, CI и production bundles.
- [x] PNG import/export через Rust.
- [x] Canvas 2D, HiDPI, zoom, pan, Fit to screen и 100%.
- [x] Первые raster-инструменты: карандаш, кисть, ластик и flood fill.
- [x] Primary/secondary colors и native color picker.
- [x] Базовые слои: создание, удаление с защитой последнего слоя, порядок,
  видимость, opacity и переименование.
- [x] Normal source-over compositing и экспорт итогового композита PNG.
- [x] Undo/redo последней raster-операции.
- [x] GitHub Actions для проверок и GitHub Release workflow по version tag.

### Главные ограничения текущей версии

- История хранит полный snapshot слоя и поддерживает только одну команду.
- Нет project format: открытый PNG разворачивается в один raster-слой.
- Нет Save/Save As, autosave, восстановления после сбоя и предупреждения о
  несохранённых изменениях.
- PNG — единственный пользовательский формат; JPEG/WebP/clipboard отсутствуют.
- Слои не имеют thumbnails, merge, lock и истории операций.
- Тяжёлые raster-операции выполняются в renderer thread и не готовы к 4K/8K.

## 1. Границы продукта

### MVP

- Растровый редактор, не vector editor.
- Один документ в окне до появления устойчивой модели вкладок.
- sRGB RGBA8 со **straight alpha** во всём editor core.
- Слои с обычным alpha blending, visibility и opacity.
- Основные инструменты: pencil, brush, eraser, fill, eyedropper, selection,
  move и простые фигуры.
- PNG, JPEG и WebP; собственный формат проекта для слоёв.
- Undo/redo с предсказуемым лимитом памяти.
- Windows x64, macOS Intel/Apple Silicon и Linux x64.

### Явно не входит до 1.0

- CMYK, RAW, PSD и цветовые профили для допечатной подготовки.
- Анимация, smart objects, сложные маски и плагины.
- Облачная синхронизация и совместное редактирование.
- Профессиональный brush engine, AI-функции и неразрушающие adjustment layers.

## 2. Технические принципы

1. **React — UI, не bitmap storage.** Пиксели и большие буферы остаются в
   `EditorSession`/renderer, а React хранит только UI state.
2. **Rust — файловые операции и тяжёлые вычисления.** Полный bitmap допустимо
   передавать по IPC при явном open/save, но не во время pointer move.
3. **Один путь композитинга.** Preview canvas и export обязаны использовать одну
   реализацию compositing, иначе изображение на экране и в файле разойдутся.
4. **Каждая пользовательская операция атомарна.** Мазок, fill, transform и
   layer command должны либо завершиться полностью, либо быть отменены.
5. **Надёжность раньше breadth.** Не добавлять много инструментов поверх
   snapshot-history, которая не выдержит реальный документ.
6. **Кроссплатформенность проверяется, а не предполагается.** CI build не
   заменяет ручную проверку файлов, input и file picker на каждой ОС.

## 3. Архитектурные ориентиры

```text
src/editor/
├── document/     # metadata документа и project model
├── session/      # mutable editor state вне React
├── renderer/     # surfaces, compositing, dirty regions
├── history/      # Command, undo/redo, memory budget
├── layers/       # layer commands и UI panel
├── tools/        # Tool contract и raster tools
├── selection/    # selection geometry и masks
├── viewport/     # screen ↔ viewport ↔ document transforms
└── files/        # frontend bridge к Tauri commands

src-tauri/src/
├── png.rs        # текущий codec boundary
├── codecs/       # PNG/JPEG/WebP и project container
├── filesystem/   # atomic write, recent files, recovery
├── commands/     # typed Tauri commands
└── errors/       # stable Rust → TypeScript error model
```

### Обязательные архитектурные задачи до сложных функций

- [x] Ввести типизированный формат ошибок Rust → TypeScript: код, понятное
  сообщение и технический context.
- [x] Описать контракт команд Open/Save/Export и правила ownership bitmap.
- [x] Ввести `Command` с `label`, `undo()` и `redo()`.
- [x] Перейти от full-layer snapshot к patch/dirty rectangle; для больших
  документов подготовить tile-based storage.
- [x] Добавить composite cache с явной invalidation.
- [x] Не сериализовать большие RGBA-буферы как JSON в горячих путях.

## 4. Приоритет P0 — надёжный editor core

Это следующий обязательный этап. Новые сложные инструменты не должны
добавляться до его завершения.

### 4.1 Полная история операций

- [x] Несколько undo/redo операций, а не один уровень.
- [x] Clear redo после новой команды.
- [x] `Command.label` для будущей UI-истории и доступности.
- [x] Patch history: хранить изменённую область `before/after` вместо полного
  слоя для pencil, brush, eraser и fill.
- [x] История layer commands: add, delete, rename, reorder, visibility, opacity.
- [x] Memory budget, очистка старых команд и отображение занятой памяти.
- [x] Отмена незавершённого инструмента без попадания в историю.
- [ ] Unit-тесты undo/redo, redo invalidation и memory limit.

**Definition of done:** 100 последовательных мазков на документе 1920×1080
отменяются/возвращаются корректно; история не копирует полный слой на каждый
pointer event.

### 4.2 Надёжное сохранение

- [x] Разделить **Save**, **Save As** и **Export**.
- [x] `Ctrl/Cmd+S`, Save As и предупреждение при закрытии dirty-документа.
- [x] Atomic write через временный файл и rename.
- [x] Ошибка записи не повреждает существующий файл.
- [x] Recent files и проверка доступности исходного пути.
- [x] Тесты ошибки записи и повторного сохранения.

### 4.3 Завершение basic Paint workflow

- [x] Пипетка активного слоя и итогового композита.
- [x] Ввод/отображение HEX, RGB и alpha.
- [x] Настройка tolerance для fill.
- [x] `X` для swap colors, `D` для reset black/white.
- [x] Горячие клавиши инструментов и размера кисти.
- [x] Не перехватывать hotkeys в input, dialog и при работе с IME.
- [x] Preview размера brush/eraser.

## 5. Milestone 0.3 — полноценные слои и project format

Базовая панель уже существует. Цель milestone — сделать слои пригодными для
реальной работы и сохранения.

### 5.1 Layer workflow

- [ ] Duplicate layer.
- [ ] Drag-and-drop reorder с keyboard fallback.
- [ ] Layer thumbnails и invalidation thumbnail только при изменении слоя.
- [ ] Lock layer и lock transparency.
- [ ] Merge down, merge visible и flatten как undoable commands.
- [ ] Переименование через доступный inline edit.
- [ ] Композитный preview cache и dirty rectangles.

## 6. Milestone 0.4 — selection, clipboard и обмен данными

### 6.1 Прямоугольное выделение

- [ ] Replace, add, subtract и intersect modes.
- [ ] Select all, deselect и invert.
- [ ] «Бегущие муравьи» без постоянной raster-перерисовки.
- [ ] Ограничить pencil/brush/eraser/fill выделенной областью.
- [ ] Delete, crop и move selected pixels как отдельные commands.

### 6.2 Clipboard и drag-and-drop

- [ ] Copy/cut/paste selected pixels с alpha.
- [ ] Paste как новый слой.
- [ ] Вставка изображения из браузера и сторонних приложений.
- [ ] Drag-and-drop PNG/JPEG/WebP в окно.
- [ ] Ручная матрица clipboard для Windows, macOS и Linux.

## 7. Milestone 0.5 — форматы, фигуры и трансформации

### 7.1 Форматы

- [ ] JPEG import/export с quality и выбором фона при потере alpha.
- [ ] WebP import/export с quality.
- [ ] Decode limits, EXIF orientation и понятные ошибки повреждённых файлов.
- [ ] Запоминание последнего export format.

### 7.2 Фигуры и трансформации

- [ ] Line tool: preview, width, Shift-constrained angles, одна history command.
- [ ] Rectangle и ellipse: stroke, fill, stroke+fill, modifiers.
- [ ] Move layer и move selection.
- [ ] Canvas resize, image resize, crop, rotate 90°, flip.
- [ ] Nearest-neighbor и bilinear interpolation.

## 8. Milestone 0.6 — текст, фильтры и recovery

- [ ] Растеризуемый text tool: Unicode, кириллица, emoji, fallback fonts.
- [ ] Базовые Rust filters: invert, grayscale, brightness, contrast, blur.
- [ ] Preview, cancel и progress для длительных операций.
- [ ] Autosave/recovery с очисткой устаревших файлов.
- [ ] Performance profiling и benchmarks brush/compositing.
- [ ] Проверки 4K, 20–50 слоёв и memory budget.

## 9. Milestone 1.0 — release quality

- [ ] Ручная проверка Windows 10/11, macOS Intel/Apple Silicon, Linux X11/Wayland.
- [ ] Проверка мыши, touchpad, HiDPI, нескольких мониторов и file picker.
- [ ] Light/dark theme, small-window layout и базовая accessibility review.
- [ ] Подписанные Windows/macOS artifacts и macOS notarization.
- [ ] Checksums, release notes и проверенный updater.
- [ ] Public architecture guide, format specification и contributor guides.
- [ ] Ноль известных сценариев потери данных при save/recovery.

## 10. Производительность: правила эскалации

Canvas 2D остаётся renderer для ранних milestones. Переход к tiles, Worker,
Rust или GPU оправдан только после измерения.

| Симптом | Следующая мера |
|---|---|
| Preview кисти отстаёт | dirty rectangles и coalescing pointer events |
| Undo расходует память | patch history, затем tiles |
| Композитинг тормозит с 10+ слоями | composite cache и invalidation |
| Fill блокирует UI | Worker или Rust command с cancellation |
| 4K PNG долго открывается | decode/resize в Rust, progress UI |
| Canvas 2D не справляется после профилирования | исследовать WebGL/WebGPU |

Целевые показатели перед 1.0:

- [ ] Pan и zoom субъективно плавные на 4K preview.
- [ ] Brush не теряет pointer samples на 60 FPS input.
- [ ] 4K PNG открывается без блокировки интерфейса.
- [ ] Undo одного мазка выполняется почти мгновенно.
- [ ] 20 видимых слоёв не создают критического input lag.

## 11. Качество, CI и релизы

### Автоматические проверки

- [x] Prettier, ESLint, TypeScript и frontend unit tests.
- [x] `cargo fmt`, `cargo clippy` и Rust tests.
- [x] Build matrix: Windows, macOS и Linux.
- [x] Release workflow по tag `v*`.
- [ ] Добавить `cargo check` как отдельный быстрый CI step.
- [ ] Component tests для tools/layers UI.
- [ ] E2E: open PNG → edit → undo/redo → export PNG.
- [ ] Golden tests для compositing и codecs.
- [ ] Fuzzing image/project decoders.
- [ ] Release checksums и artifact signing.

### Release policy

1. Версия в `package.json`, `Cargo.toml` и `tauri.conf.json` должна совпадать.
2. Пушится tag `vX.Y.Z`, совпадающий с application version.
3. CI публикует bundles в GitHub Release.
4. Release публикуется после smoke test минимум на Windows и review community
   для macOS/Linux.
5. До signing/notarization артефакты прямо помечаются как unsigned preview.

## 12. Open-source процесс

- [x] README, CONTRIBUTING, Code of Conduct, issue/PR templates и roadmap.
- [ ] `ARCHITECTURE.md` с ownership editor core и Rust boundary.
- [ ] `docs/adding-a-tool.md` и `docs/testing.md`.
- [ ] Labels `good first issue`, `help wanted`, `area/*`, `platform/*`.
- [ ] GitHub Discussions для design proposals.
- [ ] Conventional Commits и generated changelog.
- [ ] SECURITY.md и private vulnerability-reporting process.
- [ ] Dependabot/Renovate и dependency license review.
- [ ] RFC process для file format, plugin API, renderer и breaking changes.

## 13. Правила принятия задач

Новая задача считается готовой, когда:

1. есть понятное поведение и границы;
2. обновлены tests и документация, если поведение доступно пользователю;
3. `npm run format`, `npm run lint`, `npm run typecheck`, `npm run test` проходят;
4. для Rust-изменений проходят `cargo fmt`, `cargo clippy` и `cargo test`;
5. для file/input/platform-функций добавлена ручная проверка в соответствующую
   matrix;
6. изменение не регрессирует save, compositing или memory budget.

## 14. Очерёдность ближайших pull requests

1. Multi-step patch-based undo/redo и memory budget.
2. Save/Save As с atomic write и dirty-close guard.
3. Пипетка, HEX/RGB/alpha, fill tolerance и hotkeys.
4. Layer commands, thumbnails, merge и `.chudopaint` format.
5. Selection + clipboard + drag-and-drop.
6. JPEG/WebP, фигуры и трансформации.

Эта последовательность намеренно ставит надёжность и обратимость изменений
выше количества инструментов: без них пользователь не сможет безопасно
работать с уже реализованными слоями и raster-операциями.
