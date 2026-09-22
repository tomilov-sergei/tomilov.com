
#ifdef USE_MAP
  vec4 sampledDiffuseColor = vec4(1.0);
  if (enableFraming) {
    vec2 uv = (vMapUv - 0.5) / 0.9 + 0.5;
    sampledDiffuseColor = texture2D( map, uv );
    vec2 imgSize = vec2(textureSize(map, 0));
    vec2 aspect = vec2(imgSize.x / imgSize.y, 1.0);
    vec2 borderUV = uv * aspect;
    float maxBounds = min(imgSize.x, imgSize.y);
    float aa = 2.0 / maxBounds;
    float corners = BORDER_RADIUS / maxBounds;
    if (imgSize.x < imgSize.y && uv.x < 0.5) corners = 0.0;
    vec2 center = vec2(0.5) * aspect;
    float area = sdRoundedBox(borderUV - center, center, corners);
    sampledDiffuseColor.rgb *= fill(area, aa);
  } else {
    sampledDiffuseColor = texture2D( map, vMapUv );
  }

  diffuseColor *= sampledDiffuseColor;
#endif
