Pod::Spec.new do |s|
  s.name           = 'GaitVision'
  s.version        = '1.0.0'
  s.summary        = 'On-device running-gait analysis from a phone video, with Apple Vision body pose.'
  s.description    = 'RunGuard 2.0: cadence, vertical oscillation and left/right ground-contact asymmetry from a side-view clip. Nothing leaves the device.'
  s.license        = 'MIT'
  s.author         = 'RunGuard'
  s.homepage       = 'https://github.com/runguard663-ui/frREALRUNGUARDfr'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/runguard663-ui/frREALRUNGUARDfr.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'Vision', 'AVFoundation'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
