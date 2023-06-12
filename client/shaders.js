// Yay shaders
if(typeof window.loadShader !== "function"){
  throw new Error("window.loadShader is missing")
}

function loadColorShader(name, color){
  return loadShader(name, null, `
    uniform float u_time;

    vec4 frag(vec2 pos, vec2 uv, vec4 color, sampler2D tex) {
      vec4 c = def_frag();
      return mix(c, vec4(${(color[0] / 255).toFixed(2)} - c.r, ${(color[1] / 255).toFixed(2)} - c.g, ${(color[2] / 255).toFixed(2)} - c.b, c.a), 2.0);
    }
  `)
}

// Example: loadShaderColor("orange", [255, 70, 0]) will load a shader named "orange" that changes the color to orange when loaded as a component via shader()