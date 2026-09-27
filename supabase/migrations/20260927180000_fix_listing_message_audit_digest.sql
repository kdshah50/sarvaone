-- Fix: listing_messages INSERT fails with
--   ERROR: function digest(text, unknown) does not exist
-- This blocks in-app chat (and used to block quote requests before the app soft-fallback).
--
-- Run in Supabase Dashboard → SQL Editor → New query → Run (on project dhwasldcvgzoqhlumunj).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Replace broken audit trigger with a digest cast that works on modern Postgres/Supabase.
CREATE OR REPLACE FUNCTION public.archive_listing_message_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  conv record;
  hash text;
BEGIN
  SELECT listing_id, buyer_id, seller_id
    INTO conv
  FROM public.listing_conversations
  WHERE id = NEW.conversation_id;

  IF conv.listing_id IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    hash := encode(digest(convert_to(coalesce(NEW.body, ''), 'UTF8'), 'sha256'), 'hex');
  EXCEPTION WHEN undefined_function THEN
    hash := md5(coalesce(NEW.body, ''));
  END;

  INSERT INTO public.listing_message_audit_log (
    message_id, conversation_id, listing_id, buyer_id, seller_id, sender_id,
    body, body_sha256, message_source, message_created_at
  ) VALUES (
    NEW.id,
    NEW.conversation_id,
    conv.listing_id,
    conv.buyer_id,
    conv.seller_id,
    NEW.sender_id,
    NEW.body,
    hash,
    coalesce(NEW.message_source, 'user'),
    NEW.created_at
  );

  RETURN NEW;
EXCEPTION
  WHEN undefined_table THEN
    RETURN NEW;
  WHEN unique_violation THEN
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_archive_listing_message_audit ON public.listing_messages;
DROP TRIGGER IF EXISTS listing_messages_audit_archive ON public.listing_messages;
DROP TRIGGER IF EXISTS archive_listing_message ON public.listing_messages;

-- Drop any leftover triggers that call digest incorrectly (name may vary).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT t.tgname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'listing_messages'
      AND NOT t.tgisinternal
      AND pg_get_triggerdef(t.oid) ILIKE '%digest%'
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.listing_messages', r.tgname);
  END LOOP;
END $$;

CREATE TRIGGER trg_archive_listing_message_audit
  AFTER INSERT ON public.listing_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.archive_listing_message_audit();

-- Smoke test (rolled back):
-- BEGIN;
-- INSERT INTO public.listing_messages (conversation_id, sender_id, body)
-- SELECT id, buyer_id, 'digest fix smoke' FROM public.listing_conversations LIMIT 1;
-- ROLLBACK;
