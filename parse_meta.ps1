$d = Get-Content -Path 'C:\Users\n0801\OneDrive\デスクトップ\claude\meta_last30_campaigns.json' -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Host "=== Campaign Summary ==="
Write-Host ("Total campaigns: " + $d.data.Count)
foreach ($c in $d.data) {
    $leadVal = "0"
    foreach ($a in $c.actions) {
        if ($a.action_type -eq "lead") { $leadVal = $a.value }
    }
    $cpaLead = "N/A"
    foreach ($a in $c.cost_per_action_type) {
        if ($a.action_type -eq "lead") { $cpaLead = $a.value }
    }
    Write-Host ("Campaign: " + $c.campaign_name + " | spend=" + $c.spend + " | imp=" + $c.impressions + " | clicks=" + $c.clicks + " | leads=" + $leadVal + " | CPL=" + $cpaLead + " | CTR=" + $c.ctr + " | CPC=" + $c.cpc)
}

Write-Host ""
Write-Host "=== Ads Summary ==="
$ads = Get-Content -Path 'C:\Users\n0801\OneDrive\デスクトップ\claude\meta_last14_ads.json' -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Host ("Total ads: " + $ads.data.Count)
foreach ($ad in $ads.data) {
    $leadVal = "0"
    foreach ($a in $ad.actions) {
        if ($a.action_type -eq "lead") { $leadVal = $a.value }
    }
    $cpaLead = "N/A"
    foreach ($a in $ad.cost_per_action_type) {
        if ($a.action_type -eq "lead") { $cpaLead = $a.value }
    }
    Write-Host ("Ad: " + $ad.ad_name + " | spend=" + $ad.spend + " | imp=" + $ad.impressions + " | clicks=" + $ad.clicks + " | leads=" + $leadVal + " | CPL=" + $cpaLead + " | CTR=" + $ad.ctr)
}
