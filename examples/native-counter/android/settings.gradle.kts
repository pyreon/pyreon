// Gradle settings — single-module Android Compose app.
// Mirror of `native-todomvc-android/settings.gradle.kts`.

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "PyreonCounter"
include(":app")
