# AWS Deploy — AGROS ST2 v6.19.0-R31

Package installer backs up every replaced file to /tmp before copying.

## Apply and test only
bash install_r31.sh

## Apply, test and restart PM2
bash install_r31.sh --restart

After restart, new real entries remain fail-closed until startup reconciliation is READY. Existing real positions remain exchange-exposed and continue protection/reconciliation.
