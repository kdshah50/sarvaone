-- Optional Hindi / Gujarati copy for the same listing (buyer language via ?lang=).
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS title_hi text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS title_gu text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS description_hi text;
ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS description_gu text;

COMMENT ON COLUMN public.listings.title_hi IS 'Optional listing title in Hindi (Devanagari).';
COMMENT ON COLUMN public.listings.title_gu IS 'Optional listing title in Gujarati.';
COMMENT ON COLUMN public.listings.description_hi IS 'Optional description in Hindi.';
COMMENT ON COLUMN public.listings.description_gu IS 'Optional description in Gujarati.';
