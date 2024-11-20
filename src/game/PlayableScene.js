var vertex = `attribute vec4 a_position;
attribute vec3 a_normal;
attribute vec2 a_texcoord;
uniform mat4 u_worldViewProjection;
uniform mat4 u_worldInverseTranspose;
 
varying vec2 v_texcoord;

varying vec3 v_normal;

   void main() {
      // Multiply the position by the matrix.
      gl_Position = u_worldViewProjection * a_position;
      v_texcoord = a_texcoord;
      // orient the normals and pass to the fragment shader
      v_normal = mat3(u_worldInverseTranspose) * a_normal;
   }
   `;

var frag = `precision mediump float;

// Passed in from the vertex shader.
varying vec4 v_color;
varying vec3 v_normal;

//uniform vec3 u_reverseLightDirection;
uniform vec4 u_color;
varying vec2 v_texcoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;

   void main() {
   // because v_normal is a varying it's interpolated
   // so it will not be a unit vector. Normalizing it
   // will make it a unit vector again
   vec3 normal = normalize(v_normal);

   //float light = dot(normal, u_reverseLightDirection);

      gl_FragColor =  mix(texture2D(u_texture0, v_texcoord), texture2D(u_texture1, v_texcoord), 0.5);   

      // Lets multiply just the color portion (not the alpha)
      // by the light
      //gl_FragColor.rgb *= (light + 0.5);
   }`
var frag1 = `precision mediump float;

// Passed in from the vertex shader.
varying vec4 v_color;
varying vec3 v_normal;

//uniform vec3 u_reverseLightDirection;
uniform vec4 u_color;
varying vec2 v_texcoord;
uniform sampler2D u_texture;

   void main() {
   // because v_normal is a varying it's interpolated
   // so it will not be a unit vector. Normalizing it
   // will make it a unit vector again
   vec3 normal = normalize(v_normal);

   //float light = dot(normal, u_reverseLightDirection);

      gl_FragColor =  texture2D(u_texture, v_texcoord);   

      // Lets multiply just the color portion (not the alpha)
      // by the light
      //gl_FragColor.rgb *= (light + 0.5);
   }`


vertex = `attribute vec4 a_position;
attribute vec3 a_normal;
attribute vec2 a_texcoord;
uniform mat4 u_worldViewProjection;
uniform mat4 u_worldInverseTranspose;
 attribute vec3 a_biome;
 varying vec3 v_biome;
varying vec2 v_texcoord;

varying vec3 v_normal;

   void main() {
      // Multiply the position by the matrix.
      gl_Position = u_worldViewProjection * a_position;
      v_texcoord = a_texcoord;
      // orient the normals and pass to the fragment shader
      v_normal = mat3(u_worldInverseTranspose) * a_normal;
      v_biome = a_biome;
   }
   `;

frag = `precision mediump float;

// Passed in from the vertex shader.
varying vec4 v_color;
varying vec3 v_normal;

//uniform vec3 u_reverseLightDirection;
uniform vec4 u_color;
 varying vec3 v_biome;

varying vec2 v_texcoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform sampler2D u_texture2;

   void main() {
   // because v_normal is a varying it's interpolated
   // so it will not be a unit vector. Normalizing it
   // will make it a unit vector again
   vec3 normal = normalize(v_normal);

   //float light = dot(normal, u_reverseLightDirection);


      gl_FragColor = mix( vec4(1., 1., 1., 1.),  texture2D(u_texture0, v_texcoord),floor( .5 +v_biome.x)== 0. ? 1. : 0.);
      gl_FragColor = mix(gl_FragColor,  texture2D(u_texture1, v_texcoord),floor( .5 + v_biome.x)== 1. ? 1. : 0.);
      gl_FragColor = mix(gl_FragColor,  texture2D(u_texture2, v_texcoord),floor( .5 + v_biome.x)== 2. ? 1. : 0.);

      gl_FragColor = mix(gl_FragColor, texture2D(u_texture0, v_texcoord),floor( .5 + v_biome.y) == 0. ? 1. - v_biome.z : 0.);
      gl_FragColor = mix(gl_FragColor, texture2D(u_texture1, v_texcoord), floor( .5 +v_biome.y) == 1. ? 1. - v_biome.z : 0.);
        gl_FragColor = mix(gl_FragColor, texture2D(u_texture2, v_texcoord), floor( .5 +v_biome.y) == 2. ? 1. - v_biome.z : 0.);


      // Lets multiply just the color portion (not the alpha)
      // by the light
      //gl_FragColor.rgb *= (light + 0.5);
   }`




var vxxx = `attribute vec4 a_position;
attribute vec3 a_normal;
attribute vec2 a_texcoord;
uniform mat4 u_worldViewProjection;
uniform mat4 u_worldInverseTranspose;
 varying vec4 v_position;

varying vec2 v_texcoord;

varying vec3 v_normal;

   void main() {
      // Multiply the position by the matrix.
      v_position =  a_position;
      gl_Position = u_worldViewProjection * a_position;
      v_texcoord = a_texcoord;
      // orient the normals and pass to the fragment shader
      v_normal = mat3(u_worldInverseTranspose) * a_normal;
   }
   `;

var fxxx = `precision mediump float;

// Passed in from the vertex shader.
varying vec4 v_color;
varying vec3 v_normal;
 varying vec4 v_position;

//uniform vec3 u_reverseLightDirection;
uniform vec4 u_color;
varying vec2 v_texcoord;
uniform sampler2D u_texture0;
uniform sampler2D u_texture1;
uniform float u_time;

   void main() {
  
   vec3 normal = normalize(v_normal);

   //float light = dot(normal, u_reverseLightDirection);

      gl_FragColor =  mix(texture2D(u_texture0, v_texcoord), texture2D(u_texture1, v_texcoord), 0.5);   

      // Lets multiply just the color portion (not the alpha)
      // by the light
      gl_FragColor = vec4(0.,0.,0.,1.);
     gl_FragColor.g = pow(v_position.g, (sin(u_time) + 1.) * 5.);
   }`

const skyboxMaterial = MAT_sky;

const simpleMaterial = new Material(
    `attribute vec4 a_position;
attribute vec3 a_normal;
attribute vec2 a_texcoord;
uniform mat4 u_worldViewProjection;
uniform mat4 u_worldInverseTranspose;

varying vec2 v_texcoord;

varying vec3 v_normal;

   void main() {
      // Multiply the position by the matrix.
      gl_Position = u_worldViewProjection * a_position;
      v_texcoord = a_texcoord;
      // orient the normals and pass to the fragment shader
      v_normal =  a_normal;
   }`, `precision mediump float;

void main() {
  gl_FragColor = vec4(0.,0.,0.,1.);
}`
)
const SHADOW_SIZE = 1024 * 2;
const renderTexture = new ShadowTexture(SHADOW_SIZE, SHADOW_SIZE);
const konataTexture = new Texture('');
const bocchiMaterial = new MaterialWithShadow(`attribute vec4 a_position;
attribute vec2 a_texcoord;
attribute vec3 a_normal;

uniform mat4 u_projection;
uniform mat4 u_view;
uniform mat4 u_world;
uniform mat4 u_textureMatrix;

varying vec2 v_texcoord;
varying vec4 v_projectedTexcoord;
varying vec3 v_normal;
varying vec3 v_position;
void main() {
    vec4 worldPosition = u_world * a_position;
    gl_Position = u_projection * u_view * worldPosition;
  v_position = (u_view * u_world * a_position).xyz;
    v_texcoord = a_texcoord;
    v_projectedTexcoord = u_textureMatrix * worldPosition;
    v_normal = normalize(mat3(u_world) * a_normal);
}`, `precision mediump float;
varying vec2 v_texcoord;
varying vec4 v_projectedTexcoord;
varying vec3 v_normal;
varying vec3 v_position;

uniform sampler2D u_texture0; // Tekstura koloru
uniform sampler2D u_texture1; // Tekstura głębokości (cienia)
uniform vec3 u_reverseLightDirection; // Kierunek światła (odwrotny)

float bias = -0.005; // Bias dla uniknięcia efektu "shadow acne"
float softness = 0.005; // Dodatkowy parametr dla miękkich cieni
 float u_fogDensity = 0.5;
 uniform sampler2D u_texture;
 vec4 u_fogColor = vec4(0.7, 0.8, 1.0, 1.);
  float u_fogNear = 100.;
 float u_fogFar = 300.;
void main() {
    // Normalizacja wektora normalnych
    vec3 normal = normalize(v_normal);

    // Obliczanie intensywności światła na podstawie kąta padania
    float light = max(dot(normal, u_reverseLightDirection), 0.2);

    // Przekształcanie współrzędnych tekstury projekcji
    vec3 projectedTexcoord = v_projectedTexcoord.xyz / v_projectedTexcoord.w;
    float currentDepth = projectedTexcoord.z + bias;

    // Sprawdzanie, czy projekcja mieści się w zakresie
    bool inRange = 
        projectedTexcoord.x >= 0.0 && projectedTexcoord.x <= 1.0 &&
        projectedTexcoord.y >= 0.0 && projectedTexcoord.y <= 1.0;

    // Pobieranie głębokości z tekstury głębokości
    float projectedDepth = texture2D(u_texture0, projectedTexcoord.xy).r;

    // Obliczanie stopnia oświetlenia cienia, z uwzględnieniem miękkich krawędzi
    float shadowLight = inRange && projectedDepth + softness < currentDepth ? 0.1 : 1.0;

    // Pobieranie koloru z tekstury koloru
    vec4 texColor = texture2D(u_texture1, v_texcoord);

    // Kombinowanie światła, cienia i koloru tekstury
    vec3 shadedColor = texColor.rgb * light * shadowLight;

    // Ustawienie końcowego koloru fragmentu

      float fogDistance = length(v_position);
  float fogAmount = smoothstep(u_fogNear, u_fogFar, fogDistance);

  gl_FragColor = mix(vec4(shadedColor, texColor.a), u_fogColor, fogAmount);
}
        `, [renderTexture, konataTexture]);




const terrainMaterial = new BiomeMaterial(`attribute vec4 a_position;
attribute vec2 a_texcoord;
attribute vec3 a_normal;
attribute vec4 a_biome;

uniform mat4 u_projection;
uniform mat4 u_view;
uniform mat4 u_world;
uniform mat4 u_textureMatrix;

varying vec2 v_texcoord;
varying vec4 v_projectedTexcoord;
varying vec4 v_biome;
varying vec3 v_normal;
varying vec3 v_position;
varying vec3 v_trueposition;
void main() {
    vec4 worldPosition = u_world * a_position;
    gl_Position = u_projection * u_view * worldPosition;
  v_position = (u_view * u_world * a_position).xyz;
  v_trueposition = ( u_world * a_position).xyz;
    v_texcoord = a_texcoord;
    v_biome = a_biome;
    v_projectedTexcoord = u_textureMatrix * worldPosition;
    v_normal = normalize(mat3(u_world) * a_normal);
}`, `precision mediump float;
varying vec2 v_texcoord;
varying vec4 v_projectedTexcoord;
varying vec3 v_normal;
varying vec3 v_position;
varying vec4 v_biome;
float random (in vec2 st) {
    return fract(sin(dot(st.xy,
                         vec2(12.9898,78.233)))*
        43758.5453123);
}

// Based on Morgan McGuire @morgan3d
// https://www.shadertoy.com/view/4dS3Wd
float noise (in vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);

    // Four corners in 2D of a tile
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) +
            (c - a)* u.y * (1.0 - u.x) +
            (d - b) * u.x * u.y;
}
varying vec3 v_trueposition;

#define OCTAVES 6
float fbm (in vec2 st) {
    // Initial values
    float value = 0.0;
    float amplitude = .5;
    float frequency = 0.;
    //
    // Loop of octaves
    for (int i = 0; i < OCTAVES; i++) {
        value += amplitude * noise(st);
        st *= 2.;
        amplitude *= .5;
    }
    return value;
}
uniform sampler2D u_texture0; // Tekstura koloru
uniform sampler2D u_texture1; // Tekstura głębokości (cienia)
uniform sampler2D u_texture2; // Tekstura głębokości (cienia)
uniform sampler2D u_texture3; // Tekstura głębokości (cienia)
uniform sampler2D u_texture4; // Tekstura głębokości (cienia)
uniform vec3 u_reverseLightDirection; // Kierunek światła (odwrotny)

float bias = -0.005; 
float softness = 0.005;
 float u_fogDensity = 0.5;
 uniform sampler2D u_texture;
 vec4 u_fogColor = vec4(0.7, 0.8, 1.0, 1.);
  float u_fogNear = 300.;
 float u_fogFar = 500.;
vec4 colorForBiome(sampler2D tex, vec2 coords, vec3 nor) {
return mix( texture2D(tex, coords / 2.), texture2D(tex, coords / 2. + vec2(0.5)), 1. - smoothstep(0.5   , 0.7, dot(nor, vec3(0., 1., 0.))));
    }
 void main() {
    vec3 normal = normalize(v_normal);

    float light = max(dot(normal, u_reverseLightDirection), 0.2);

    vec3 projectedTexcoord = v_projectedTexcoord.xyz / v_projectedTexcoord.w;
    float currentDepth = projectedTexcoord.z + bias;

    bool inRange = 
        projectedTexcoord.x >= 0.0 && projectedTexcoord.x <= 1.0 &&
        projectedTexcoord.y >= 0.0 && projectedTexcoord.y <= 1.0;

    float projectedDepth = texture2D(u_texture0, projectedTexcoord.xy).r;

    float shadowLight = inRange && currentDepth  > projectedDepth  ? 0.2 :( dot(normal, u_reverseLightDirection) <= 0. ? 0.2 : light);
    vec4 texColor = colorForBiome(u_texture1, v_texcoord, normal) * v_biome.x +
    colorForBiome(u_texture2, v_texcoord, normal) * v_biome.y +
    colorForBiome(u_texture3, v_texcoord, normal) * v_biome.z+ 
    colorForBiome(u_texture4, v_texcoord, normal) * v_biome.w;

   vec3 shadedColor = texColor.rgb * shadowLight;

  float fogDistance = length(v_position);
   float fogAmount = smoothstep(u_fogNear, u_fogFar, fogDistance);

   gl_FragColor = mix(vec4(shadedColor, texColor.a), u_fogColor, fogAmount);
}
        `, [renderTexture, new Texture('./textures/snow.png'), new Texture('./textures/sand.png'), new Texture('./textures/weeds.png'), new Texture('./textures/grass.png')])

const bocchiMaterialee = new MaterialWithTexture(vertex, frag1);
let t = new Transform();

const player = new Actor('player', [
    t,
    new CharacterController(),
    new ObjectWithVelocity(),
    new ObjectWithVelocityMoveEveryFrame(),
    new GravitateTowardsTerrain('terrain', 10),
    new CameraController('camera'),
    new ShowTerrainNearbyController({
        terrainIdentifier: 'terrain',
        terrainRadiusToShow: 6
    }),
    new ScoreState(),

])
const cameraRenderer =
    new Renderer(document.querySelector('#xxx'));
const camera = new Actor('camera', [
    new Transform({ position: [0, 4, 0] }),
    cameraRenderer,
]);
const skybox = new Actor('skybox', [
    new Renderable(Mesh.QUAD, skyboxMaterial),
]);

camera.parent = player;


const sunRenderer =
    new Renderer(document.querySelector('#xxx'), ['shadowcasters'], { orthographic: true, target: t })
sunRenderer.renderTexture = renderTexture;
const sun = new Actor('sun', [
    new Transform({ position: [0, 11, 0] }),
    sunRenderer,

    new CopyPositionFromOtherObject({ targetIdentifier: 'player', offset: [100, 100, 100] })

]);

const terrain = new Actor('terrain', [
    new Gaia({ material: terrainMaterial.clone() }),
])

const scoreExample = new Actor('', [
    new SpawnThingsNearTarget({ targetIdentifier: 'player' })
]);
const UI_score = new Actor('UI_score', [
    new ScoreStateDisplayer({ targetIdentifier: 'player', interfaceIdentifier: '#score' })
])
Scene.Instance.actors = [UI_score, player, scoreExample, sun, camera, terrain, skybox];