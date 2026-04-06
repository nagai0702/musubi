[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$campaignPath = Join-Path $PSScriptRoot "meta_last30_campaigns.json"
$adsPath = Join-Path $PSScriptRoot "meta_last14_ads.json"

$d = Get-Content -Path $campaignPath -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Output "=== Campaign Summary ==="
Write-Output ("Total campaigns: " + $d.data.Count)
foreach ($c in $d.data) {
    $leadVal = "0"
    $cpaLead = "N/A"
    foreach ($a in $c.actions) {
        if ($a.action_type -eq "lead") { $leadVal = $a.value }
    }
    foreach ($a in $c.cost_per_action_type) {
        if ($a.action_type -eq "lead") { $cpaLead = $a.value }
    }
    Write-Output ("  " + $c.campaign_name + " | spend=" + $c.spend + " | imp=" + $c.impressions + " | clicks=" + $c.clicks + " | leads=" + $leadVal + " | CPL=" + $cpaLead + " | CTR=" + $c.ctr)
}

Write-Output ""
Write-Output "=== Ads Summary ==="
$ads = Get-Content -Path $adsPath -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Output ("Total ads: " + $ads.data.Count)
foreach ($ad in $ads.data) {
    $leadVal = "0"
    $cpaLead = "N/A"
    foreach ($a in $ad.actions) {
        if ($a.action_type -eq "lead") { $leadVal = $a.value }
    }
    foreach ($a in $ad.cost_per_action_type) {
        if ($a.action_type -eq "lead") { $cpaLead = $a.value }
    }
    Write-Output ("  " + $ad.ad_name + " | spend=" + $ad.spend + " | imp=" + $ad.impressions + " | clicks=" + $ad.clicks + " | leads=" + $leadVal + " | CPL=" + $cpaLead + " | CTR=" + $ad.ctr)
}
