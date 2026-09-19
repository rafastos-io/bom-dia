/**
 * Tokens de movimento do @rafastos/ui (dist/lib/motion), espelhados para não
 * importar a raiz do pacote (que puxa todos os componentes).
 * Valores idênticos ao chunk de motion do design system.
 */
export const RF_DURATION = {
  instant: 0,
  fast: 0.15,
  default: 0.22,
  moderate: 0.32,
  slow: 0.48,
} as const

export const RF_EASE = {
  standard: [0.22, 1, 0.36, 1],
  emphasized: [0.16, 1, 0.3, 1],
  exit: [0.4, 0, 1, 1],
  linear: "linear",
} as const

export const RF_DISTANCE = { sm: 6, md: 12, lg: 20 } as const
export const RF_STAGGER = 0.04

export const rfTransition = {
  fast: { duration: RF_DURATION.fast, ease: RF_EASE.standard },
  default: { duration: RF_DURATION.default, ease: RF_EASE.standard },
  moderate: { duration: RF_DURATION.moderate, ease: RF_EASE.standard },
  exit: { duration: RF_DURATION.fast, ease: RF_EASE.exit },
  emphasized: { duration: RF_DURATION.moderate, ease: RF_EASE.emphasized },
} as const

export const rfFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
} as const

export const rfSlideUp = {
  initial: { opacity: 0, y: RF_DISTANCE.md },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: RF_DISTANCE.sm },
} as const

export const rfScaleIn = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
} as const
