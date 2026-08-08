// Cloudflare Pages Function
// Route: POST /api/intake
// Handles the Landing Page intake form: uploads logo/photos to R2, writes the
// submission to the "Landing Page Intake Submissions" table in Airtable.
//
// Requires these bindings/env vars to be configured in the Pages project
// (Settings -> Functions / Environment variables):
//   INTAKE_UPLOADS        R2 bucket binding
//   R2_PUBLIC_BASE_URL    e.g. https://pub-xxxxxxxx.r2.dev  (no trailing slash)
//   AIRTABLE_API_KEY      Airtable Personal Access Token (data.records:write scope on the base)
//   AIRTABLE_BASE_ID      appBI6eyIdjOWqdtT
//   AIRTABLE_TABLE_ID     tbl4LzTpI2m8BYV2l  (Landing Page Intake Submissions)

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const formData = await request.formData();

    // Honeypot: bots that fill this hidden field get a fake success, silently dropped.
    const honeypot = formData.get('_gotcha');
    if (honeypot) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const getField = (name) => (formData.get(name) || '').toString().trim();

    const fullName = getField('full_name');
    const email = getField('email');
    const phone = getField('phone');
    const businessName = getField('business_name');
    const serviceArea = getField('service_area');
    const services = getField('services');
    const businessHours = getField('business_hours');
    const domainPreference = getField('domain_preference');
    const existingDomain = getField('existing_domain');
    const preferredDomain = getField('preferred_domain');
    const brandColors = getField('brand_colors');
    const testimonials = getField('testimonials');
    const notes = getField('notes');

    if (!fullName || !email || !phone || !businessName || !serviceArea || !services || !domainPreference) {
      return new Response(JSON.stringify({ ok: false, error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const bucket = env.INTAKE_UPLOADS;
    const publicBase = (env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');

    async function uploadFile(file, prefix) {
      if (!file || typeof file === 'string' || !file.size) return '';
      const safeName = (file.name || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = `intake/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${prefix}-${safeName}`;
      await bucket.put(key, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type || 'application/octet-stream' }
      });
      return publicBase ? `${publicBase}/${key}` : key;
    }

    let logoUrl = '';
    const logoFile = formData.get('logo');
    if (logoFile && logoFile.size) {
      logoUrl = await uploadFile(logoFile, 'logo');
    }

    const photoUrls = [];
    const photoFiles = formData.getAll('photos[]').filter((f) => f && f.size);
    for (const pf of photoFiles) {
      const url = await uploadFile(pf, 'photo');
      if (url) photoUrls.push(url);
    }

    const airtableRes = await fetch(
      `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID}/${env.AIRTABLE_TABLE_ID}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.AIRTABLE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          records: [
            {
              fields: {
                'Full Name': fullName,
                Email: email,
                Phone: phone,
                'Business Name': businessName,
                'Service Area': serviceArea,
                Services: services,
                'Business Hours': businessHours,
                'Domain Preference': domainPreference,
                'Existing Domain': existingDomain,
                'Preferred Domain': preferredDomain,
                'Logo URL': logoUrl,
                'Photo URLs': photoUrls.join('\n'),
                'Brand Colors': brandColors,
                Testimonials: testimonials,
                Notes: notes,
                'Submitted At': new Date().toISOString(),
                Status: 'New'
              }
            }
          ]
        })
      }
    );

    if (!airtableRes.ok) {
      const errText = await airtableRes.text();
      console.error('Airtable write failed:', errText);
      return new Response(JSON.stringify({ ok: false, error: 'Airtable write failed' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('Intake function error:', err);
    return new Response(JSON.stringify({ ok: false, error: 'Server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
