-- Allow any visitor to read aggregated contribution data.
-- Only amount_cents and month are exposed by the FundingWidget query;
-- contributor_email is not selected and remains protected.
create policy "contributions public read"
  on contributions
  for select
  to anon, authenticated
  using (true);
