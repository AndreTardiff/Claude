# Personal page

A simple static personal webpage with a progress log. No build step or dependencies.

## View it

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
```

## Add a progress update

In `index.html`, add a new `<li>` at the **top** of the `<ol class="log">` list:

```html
<li>
  <time datetime="YYYY-MM-DD">Mon D, YYYY</time>
  <p>What happened.</p>
</li>
```

## Caravans of the Copper Road

The game prototype lives in [`copper-road/`](copper-road/README.md): a headless simulation core,
tests (`npm test`), and a browser laboratory at `copper-road/lab/`. The design spec is
[`docs/copper-road-spec-v0.2.md`](docs/copper-road-spec-v0.2.md), rendered at `spec.html`.

## Files

- `index.html` – page content (About, Progress log, footer)
- `style.css` – styling, with automatic light/dark mode
