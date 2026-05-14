-- Coaching & training browse vertical (see lib/marketplace-categories.ts: coaching_training).

UPDATE listings
SET listing_type = 'service'
WHERE listing_type IS NULL
  AND lower(trim(category_id)) = 'coaching_training';

INSERT INTO public.county_service_catalog (
  county_key, service_slug, label_en, label_es, blurb_en, blurb_es, strategy_tag, sort_order
) VALUES
  (
    'middlesex',
    'coaching_training',
    'Coaching & training',
    'Coaching y capacitación',
    'Career, leadership, and skills coaching — structured sessions with AI-assisted booking fit.',
    'Coaching de carrera, liderazgo y habilidades — sesiones estructuradas.',
    'trust',
    55
  ),
  (
    'monmouth',
    'coaching_training',
    'Coaching & training',
    'Coaching y capacitación',
    'Executive and team coaching for the Shore and suburban corridors.',
    'Coaching ejecutivo y de equipos en la costa y suburbios.',
    'high_ticket',
    85
  )
ON CONFLICT (county_key, service_slug) DO NOTHING;
