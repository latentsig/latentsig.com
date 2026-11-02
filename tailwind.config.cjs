module.exports = {
  "darkMode": "class",
  "theme": {
    "extend": {
      "colors": {
        "surface": "#f7f4ec",
        "primary-container": "#829568",
        "primary": "#6d7b50",
        "tertiary": "#b76c4c",
        "on-tertiary-fixed": "#362419",
        "secondary-fixed-dim": "#d8cce8",
        "surface-container": "#ebe8df",
        "on-tertiary": "#fffdf8",
        "tertiary-container": "#e6c6b5",
        "inverse-primary": "#a7b78d",
        "inverse-surface": "#30332b",
        "secondary-fixed": "#ece6f4",
        "on-secondary-fixed-variant": "#514966",
        "on-primary-fixed": "#292c25",
        "on-primary-container": "#343d28",
        "on-error-container": "#ffdad6",
        "inverse-on-surface": "#f7f4ec",
        "primary-fixed": "#e4e8d7",
        "on-error": "#690005",
        "on-surface-variant": "#676b60",
        "surface-container-lowest": "#fffdf8",
        "outline-variant": "#dedbd1",
        "surface-container-high": "#e3e0d6",
        "surface-variant": "#e5e1d8",
        "on-background": "#292c25",
        "surface-tint": "#6d7b50",
        "background": "#f7f4ec",
        "surface-bright": "#fffdf8",
        "error": "#ffb4ab",
        "tertiary-fixed-dim": "#e1c5b2",
        "on-secondary-container": "#393047",
        "on-surface": "#292c25",
        "surface-dim": "#efede4",
        "secondary-container": "#d9d0e8",
        "on-secondary": "#fffdf8",
        "primary-fixed-dim": "#cbd3b6",
        "secondary": "#8474a5",
        "on-tertiary-fixed-variant": "#604331",
        "on-primary": "#fffdf8",
        "error-container": "#93000a",
        "tertiary-fixed": "#f2ded0",
        "on-primary-fixed-variant": "#454d38",
        "outline": "#898b81",
        "on-tertiary-container": "#59331f",
        "on-secondary-fixed": "#292c25",
        "surface-container-low": "#f1eee6",
        "surface-container-highest": "#d9d6cc"
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
