// Gradle settings — single-module Android Compose app.
// Mirrors the iOS xcodegen `name: PyreonTodoMVC` declaration.

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

rootProject.name = "PyreonTodoMVC"
include(":app")
