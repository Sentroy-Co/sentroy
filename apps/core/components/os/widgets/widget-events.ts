/**
 * OS-seviyesi widget-panel görünüm değişimi için CustomEvent adı. sentroy-os
 * bu event'i dinler (setWidgetView); pencere içi bileşenler (Achievements
 * "first-post" CTA'sı gibi) sentroy-os state'ine prop threading olmadan
 * ulaşmak için dispatch eder. detail = WidgetView ("activity" | "widgets" | …).
 */
export const WIDGET_VIEW_EVENT = "sentroy-os:widget-view"
