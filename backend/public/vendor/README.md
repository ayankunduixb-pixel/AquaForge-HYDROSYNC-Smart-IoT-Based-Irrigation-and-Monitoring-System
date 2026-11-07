# Vendored browser assets

## Chart.js

- File: `chart.umd.min.js`
- Version: 4.4.8
- Source: <https://cdn.jsdelivr.net/npm/chart.js@4.4.8/dist/chart.umd.min.js>
- License: MIT (see `../../../THIRD_PARTY_LICENSES/chart.js/LICENSE.md`)
- SHA-384: `4FFE0A8125AE6443E8CE93F3EEB9E7A7FE650D29E963554F242A237F54BCD6E4C74B5137F2A80B7CC815B00791096738`

The file is served from this folder so the dashboard does not depend on a
public CDN. The previous CDN `<script>` tag also had an incorrect `integrity`
hash, which caused the browser to block Chart.js.
