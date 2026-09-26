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

## Files

- `index.html` – page content (About, Progress log, footer)
- `style.css` – styling, with automatic light/dark mode
