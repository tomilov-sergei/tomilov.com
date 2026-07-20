export default {
  plugins: ["stylelint-no-unsupported-browser-features"],
  rules: {
    "alpha-value-notation": "number",
    "color-function-notation": "modern",
    "color-no-hex": true,
    "declaration-block-no-duplicate-properties": true,
    "function-disallowed-list": ["rgb", "rgba", "hsl", "hsla"],
    "plugin/no-unsupported-browser-features": [true, {
      ignore: [
        "css-touch-action",
        "css3-cursors-grab",
        "css3-cursors-newer",
        "intrinsic-width",
        "multicolumn",
        "text-decoration",
      ],
    }],
    "selector-pseudo-element-colon-notation": "double",
  },
};
