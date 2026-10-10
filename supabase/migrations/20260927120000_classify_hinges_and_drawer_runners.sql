begin

-- Zawiasy: właściwe zawiasy oraz komplety zawias + prowadnik.
-- Wkręty montażowe pozostają w dotychczasowej kategorii.
update public.materials
set category = 'Zawiasy'
where category is distinct from 'Zawiasy'
  and lower(coalesce(name, '')) like '%zawias%'
  and lower(coalesce(name, '')) not like '%wkręt%'
  and lower(coalesce(name, '')) not like '%wkret%'

-- Prowadnice: prowadnice szufladowe i ich systemy.
-- Prowadnik zawiasu, sprzęgła oraz osobne akcesoria TIP-ON nie są prowadnicami.
update public.materials
set category = 'Prowadnice'
where category is distinct from 'Prowadnice'
  and category is distinct from 'Zawiasy'
  and (
    lower(coalesce(name, '')) like '%prowadnic%'
    or (
      lower(coalesce(name, '')) similar to '%(tandem|movento|metabox|merivo|merivobox)%'
      and lower(coalesce(name, '')) not like '%sprzęgło%'
      and lower(coalesce(name, '')) not like '%sprzeglo%'
      and lower(coalesce(name, '')) not like '%tip-on do%'
    )
  )

commit

