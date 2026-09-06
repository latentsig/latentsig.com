module.exports = {
  "darkMode": "class",
  "theme": {
    "extend": {
      "colors": {
        "surface": "#0b1326",
        "primary-container": "#8083ff",
        "primary": "#c0c1ff",
        "tertiary": "#ffb783",
        "on-tertiary-fixed": "#301400",
        "secondary-fixed-dim": "#89ceff",
        "surface-container": "#171f33",
        "on-tertiary": "#4f2500",
        "tertiary-container": "#d97721",
        "inverse-primary": "#494bd6",
        "inverse-surface": "#dae2fd",
        "secondary-fixed": "#c9e6ff",
        "on-secondary-fixed-variant": "#004c6e",
        "on-primary-fixed": "#07006c",
        "on-primary-container": "#0d0096",
        "on-error-container": "#ffdad6",
        "inverse-on-surface": "#283044",
        "primary-fixed": "#e1e0ff",
        "on-error": "#690005",
        "on-surface-variant": "#c7c4d7",
        "surface-container-lowest": "#060e20",
        "outline-variant": "#464554",
        "surface-container-high": "#222a3d",
        "surface-variant": "#2d3449",
        "on-background": "#dae2fd",
        "surface-tint": "#c0c1ff",
        "background": "#0b1326",
        "surface-bright": "#31394d",
        "error": "#ffb4ab",
        "tertiary-fixed-dim": "#ffb783",
        "on-secondary-container": "#00344e",
        "on-surface": "#dae2fd",
        "surface-dim": "#0b1326",
        "secondary-container": "#00a2e6",
        "on-secondary": "#00344d",
        "primary-fixed-dim": "#c0c1ff",
        "secondary": "#89ceff",
        "on-tertiary-fixed-variant": "#703700",
        "on-primary": "#1000a9",
        "error-container": "#93000a",
        "tertiary-fixed": "#ffdcc5",
        "on-primary-fixed-variant": "#2f2ebe",
        "outline": "#908fa0",
        "on-tertiary-container": "#452000",
        "on-secondary-fixed": "#001e2f",
        "surface-container-low": "#131b2e",
        "surface-container-highest": "#2d3449"
      },
      "borderRadius": {
        "DEFAULT": "0.125rem",
        "lg": "0.25rem",
        "xl": "0.5rem",
        "full": "0.75rem"
      },
      "spacing": {
        "margin-desktop": "64px",
        "base": "8px",
        "gutter": "24px",
        "margin-mobile": "16px",
        "max-width": "1280px"
      },
      "fontFamily": {
        "body-md": [
          "Geist",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ],
        "headline-sm": [
          "Hanken Grotesk",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ],
        "headline-xl-mobile": [
          "Hanken Grotesk",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ],
        "headline-lg-mobile": [
          "Hanken Grotesk",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ],
        "headline-xl": [
          "Hanken Grotesk",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ],
        "label-md": [
          "Geist",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ],
        "headline-md": [
          "Hanken Grotesk",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ],
        "label-sm": [
          "Geist",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ],
        "headline-lg": [
          "Hanken Grotesk",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ],
        "body-lg": [
          "Geist",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ],
        "headline": [
          "Hanken Grotesk",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ],
        "display": [
          "Hanken Grotesk",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ],
        "body": [
          "Geist",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ],
        "label": [
          "Geist",
          "ui-sans-serif",
          "system-ui",
          "sans-serif"
        ]
      },
      "fontSize": {
        "body-md": [
          "16px",
          {
            "lineHeight": "24px",
            "fontWeight": "400"
          }
        ],
        "headline-sm": [
          "24px",
          {
            "lineHeight": "32px",
            "fontWeight": "600"
          }
        ],
        "headline-xl-mobile": [
          "40px",
          {
            "lineHeight": "48px",
            "fontWeight": "700"
          }
        ],
        "headline-lg-mobile": [
          "32px",
          {
            "lineHeight": "40px",
            "fontWeight": "600"
          }
        ],
        "headline-xl": [
          "64px",
          {
            "lineHeight": "72px",
            "letterSpacing": "-0.02em",
            "fontWeight": "700"
          }
        ],
        "label-md": [
          "14px",
          {
            "lineHeight": "20px",
            "letterSpacing": "0.02em",
            "fontWeight": "500"
          }
        ],
        "headline-md": [
          "32px",
          {
            "lineHeight": "40px",
            "fontWeight": "600"
          }
        ],
        "label-sm": [
          "12px",
          {
            "lineHeight": "16px",
            "letterSpacing": "0.05em",
            "fontWeight": "600"
          }
        ],
        "headline-lg": [
          "48px",
          {
            "lineHeight": "56px",
            "letterSpacing": "-0.01em",
            "fontWeight": "600"
          }
        ],
        "body-lg": [
          "18px",
          {
            "lineHeight": "28px",
            "fontWeight": "400"
          }
        ]
      }
    }
  },
  "content": [
    "./src/**/*.{astro,html,js,jsx,ts,tsx,md,mdx}"
  ]
};
module.exports.plugins = [require("@tailwindcss/forms"), require("@tailwindcss/container-queries")];
