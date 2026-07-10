# Auth Project — migration scripts

Üçüncü taraf auth provider'ından Sentroy Auth Project'e bulk user import.

Sentroy import CSV format'ı:

```csv
email,password,displayName
alice@example.com,,Alice
bob@example.com,SecurePass!9,Bob
```

Header satırı zorunlu. `password` boşsa Sentroy random 32-char üretir — kullanıcı
password-reset endpoint'i ile kendisi belirler. `displayName` opsiyonel.

Bu CSV'i şuraya POST'lar:

```
POST /api/companies/{companySlug}/auth-projects/{projectId}/users/import
Content-Type: application/json
Authorization: better-auth session cookie (admin)

{
  "csv": "email,password,displayName\nalice@..."
}
```

Veya dashboard "Users → Import CSV" dialog'unda yapıştır.

## Scripts

- [`from-firebase.mjs`](./from-firebase.mjs) — Firebase Auth export JSON → Sentroy CSV
- [`from-auth0.mjs`](./from-auth0.mjs) — Auth0 user export JSON → Sentroy CSV
- [`from-clerk.mjs`](./from-clerk.mjs) — Clerk user export CSV → Sentroy CSV (rename + filter)

Çıktıyı `output/sentroy-users.csv`'ye yazar. Dashboard'dan paste edilir.

**Önemli:** Password hash'leri taşınmaz — Sentroy argon2id kullanır, kaynak
provider'lar farklı hash'ler (bcrypt, scrypt). Hash uyumsuzluğu = manuel
password reset. Bu yüzden scriptler password kolonunu boş bırakır; user'lar
ilk girişte password-reset request'i atar.
