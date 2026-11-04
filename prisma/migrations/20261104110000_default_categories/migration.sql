-- Starting categories so suppliers can sign up and buyers can send requests on a fresh database.
INSERT INTO "Category" ("id", "name", "units") VALUES
  ('cat_vegetables', 'Vegetables and fruit', 'kg,basket,bag,crate,bunch,bundle'),
  ('cat_grains', 'Grains and dry goods', '50kg bag,kg,mudu,carton'),
  ('cat_poultry', 'Poultry and eggs', 'kg,crate,bird'),
  ('cat_meat_fish', 'Meat and fish', 'kg,carton'),
  ('cat_oils', 'Oils and condiments', '25L jerrycan,litre,carton'),
  ('cat_dairy_drinks', 'Dairy and drinks', 'carton,litre,pack')
ON CONFLICT ("name") DO NOTHING;
