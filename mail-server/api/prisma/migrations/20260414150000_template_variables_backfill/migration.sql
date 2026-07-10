-- Mevcut şablonlarda tek parantezli ({var}) ve çift parantezli ({{var}}) değişkenleri
-- variables kolonuna backfill yap. mjmlBody ve subject alanlarının tüm dillerindeki
-- içeriklerini birleştirip regex ile çıkarıyoruz.

UPDATE "templates" t
SET "variables" = ARRAY(
  SELECT DISTINCT substring(m[1] FROM '\w+')
  FROM (
    SELECT string_agg(value::text, ' ') AS combined
    FROM jsonb_each_text(
      CASE
        WHEN jsonb_typeof(t."mjmlBody") = 'object' THEN t."mjmlBody"
        ELSE jsonb_build_object('_', t."mjmlBody"#>>'{}')
      END
    )
  ) body_agg,
  LATERAL regexp_matches(
    body_agg.combined || ' ' ||
    COALESCE((
      SELECT string_agg(value::text, ' ')
      FROM jsonb_each_text(
        CASE
          WHEN jsonb_typeof(t."subject") = 'object' THEN t."subject"
          ELSE jsonb_build_object('_', t."subject"#>>'{}')
        END
      )
    ), ''),
    '\{\{?(\w+)\}?\}',
    'g'
  ) AS m
);
