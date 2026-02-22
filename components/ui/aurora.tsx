"use client"

import type React from "react"
import { forwardRef, ReactNode } from "react"
import { Shader } from "react-shaders"
import { cn } from "@/lib/utils"

export interface AuroraShadersProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Aurora wave speed
   * @default 1.0
   */
  speed?: number

  /**
   * Light intensity and brightness
   * @default 1.0
   */
  intensity?: number

  /**
   * Color vibrancy and saturation
   * @default 1.0
   */
  vibrancy?: number

  /**
   * Wave frequency and complexity
   * @default 1.0
   */
  frequency?: number

  /**
   * Vertical stretch of aurora bands
   * @default 1.0
   */
  stretch?: number
}

const auroraShader = `
precision highp float;

// Noise function for organic movement
float noise(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Smooth noise for flowing effects
float smoothNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);

    float a = noise(i);
    float b = noise(i + vec2(1.0, 0.0));
    float c = noise(i + vec2(0.0, 1.0));
    float d = noise(i + vec2(1.0, 1.0));

    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// Fractal noise for complex aurora patterns
float fractalNoise(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;

    for(int i = 0; i < 4; i++) {
        value += amplitude * smoothNoise(p);
        p *= 2.0;
        amplitude *= 0.5;
    }

    return value;
}

void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    // Normalize coordinates
    vec2 uv = fragCoord / iResolution.xy;

    // Time with speed control
    float time = iTime * u_speed;

    // Create vertical gradient for aurora positioning
    float verticalGradient = 1.0 - abs(uv.y - 0.5) * 2.0;
    verticalGradient = pow(verticalGradient, u_stretch);

    // Create flowing horizontal movement
    vec2 flowUV = vec2(uv.x + time * 0.1, uv.y);

    // Generate multiple aurora layers with different characteristics
    float aurora1 = fractalNoise(flowUV * u_frequency * 3.0 + vec2(time * 0.2, 0.0));
    float aurora2 = fractalNoise(flowUV * u_frequency * 2.0 + vec2(time * 0.15, 1000.0));
    float aurora3 = fractalNoise(flowUV * u_frequency * 4.0 + vec2(time * 0.25, 2000.0));

    // Add wave distortion for organic movement
    float wave1 = sin(uv.x * 8.0 + time * 2.0) * 0.1;
    float wave2 = sin(uv.x * 12.0 + time * 1.5) * 0.05;

    float distortedY = uv.y + wave1 + wave2;

    // Apply vertical positioning to aurora layers
    aurora1 *= smoothstep(0.3, 0.7, distortedY) * smoothstep(0.8, 0.6, distortedY);
    aurora2 *= smoothstep(0.4, 0.6, distortedY) * smoothstep(0.7, 0.5, distortedY);
    aurora3 *= smoothstep(0.35, 0.65, distortedY) * smoothstep(0.75, 0.55, distortedY);

    // Combine aurora layers
    float combinedAurora = (aurora1 * 0.6 + aurora2 * 0.8 + aurora3 * 0.4) * verticalGradient;

    // Apply intensity scaling
    combinedAurora *= u_intensity;

    // Create aurora color palette
    vec3 color1 = vec3(0.0, 0.8, 0.4);  // Green
    vec3 color2 = vec3(0.2, 0.4, 1.0);  // Blue
    vec3 color3 = vec3(0.8, 0.2, 0.8);  // Purple
    vec3 color4 = vec3(0.0, 1.0, 0.8);  // Cyan

    // Create color zones based on vertical position
    float colorMix1 = smoothstep(0.2, 0.4, uv.y);
    float colorMix2 = smoothstep(0.4, 0.6, uv.y);
    float colorMix3 = smoothstep(0.6, 0.8, uv.y);

    // Mix colors for natural aurora appearance
    vec3 finalColor = mix(color1, color2, colorMix1);
    finalColor = mix(finalColor, color3, colorMix2);
    finalColor = mix(finalColor, color4, colorMix3);

    // Apply vibrancy control
    vec3 desaturated = vec3(dot(finalColor, vec3(0.299, 0.587, 0.114)));
    finalColor = mix(desaturated, finalColor, u_vibrancy);

    // Apply aurora intensity
    finalColor *= combinedAurora;

    // Add atmospheric glow at horizon
    float horizonGlow = exp(-abs(uv.y - 0.5) * 8.0) * 0.1;
    finalColor += finalColor * horizonGlow;

    // Ensure colors stay in valid range
    finalColor = clamp(finalColor, 0.0, 1.0);

    fragColor = vec4(finalColor, 1.0);
}
`

export const AuroraShaders = forwardRef<HTMLDivElement, AuroraShadersProps>(
  (
    {
      className,
      speed = 1.0,
      intensity = 1.0,
      vibrancy = 1.0,
      frequency = 1.0,
      stretch = 1.0,
      ...props
    },
    ref,
  ) => {
    return (
      <div className={cn("w-full h-full", className)} ref={ref} {...(props as any)}>
        <Shader
          fs={auroraShader}
          style={{ width: "100%", height: "100%" } as CSSStyleDeclaration}
          uniforms={{
            u_speed: { type: "1f", value: speed },
            u_intensity: { type: "1f", value: intensity },
            u_vibrancy: { type: "1f", value: vibrancy },
            u_frequency: { type: "1f", value: frequency },
            u_stretch: { type: "1f", value: stretch },
          }}
        />
      </div>
    )
  },
)

interface AuroraBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  showRadialGradient?: boolean
  /** Animation duration in seconds. Default is 60s for subtle movement. Use lower values (10-20s) for more visible animation. */
  animationSpeed?: number
}


export const AuroraBackground = ({
  className,
  children,
  showRadialGradient = true,
  animationSpeed = 60,
  ...props
}: AuroraBackgroundProps) => {
  return (
    <main>
      <div
        className={cn(
          "transition-bg relative flex h-[100vh] flex-col items-center justify-center bg-zinc-50 text-slate-950 dark:bg-zinc-900",
          className,
        )}
        {...(props as any)}
      >
        <div
          className="absolute inset-0 overflow-hidden"
          style={
            {
              "--aurora":
                "radial-gradient(circle_at_center,#FFF9B0_0%,#FFEF4D_55%,#FEE406_100%)",
              "--dark-gradient":
                "repeating-linear-gradient(100deg,#000_0%,#000_7%,transparent_10%,transparent_12%,#000_16%)",
              "--white-gradient":
                "repeating-linear-gradient(100deg,#fff_0%,#fff_7%,transparent_10%,transparent_12%,#fff_16%)",

              "--color-1": "#FFF9B0",
              "--color-2": "#FFF27A",
              "--color-3": "#FFEF4D",
              "--color-4": "#FFE81F",
              "--color-5": "#FEE406",
              "--black": "#000",
              "--white": "#fff",
              "--transparent": "transparent",
              "--animation-speed": `${animationSpeed}s`,
            } as React.CSSProperties
          }
        >
          <div
            className={cn(
              `pointer-events-none absolute -inset-[10px] [background-image:var(--white-gradient),var(--aurora)] [background-size:300%,_200%] [background-position:50%_50%,50%_50%] opacity-50 blur-[10px] invert filter will-change-transform [--aurora:radial-gradient(circle_at_center,var(--color-1)_0%,var(--color-3)_55%,var(--color-5)_100%)] [--dark-gradient:repeating-linear-gradient(100deg,var(--black)_0%,var(--black)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--black)_16%)] [--white-gradient:repeating-linear-gradient(100deg,var(--white)_0%,var(--white)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--white)_16%)] after:absolute after:inset-0 after:[background-image:var(--white-gradient),var(--aurora)] after:[background-size:200%,_100%] after:[background-attachment:fixed] after:mix-blend-difference after:content-[""] dark:[background-image:var(--dark-gradient),var(--aurora)] dark:invert-0 after:dark:[background-image:var(--dark-gradient),var(--aurora)]`,
              "after:[animation:aurora_var(--animation-speed)_linear_infinite]",
              showRadialGradient &&
                "[mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,var(--transparent)_70%)]",
            )}
          />
        </div>
        {children}
      </div>
    </main>
  )
}

export  function AuroraBackgroundDemo() {
  return (
    <AuroraBackground showRadialGradient={true} animationSpeed={15}>
      <div className="pointer-events-none" />
    </AuroraBackground>
  )
}



AuroraShaders.displayName = "AuroraShaders"

export default AuroraShaders
