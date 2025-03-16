# tiddlystow
Store TiddlyWiki files locally using the browser file system api

This simple web page is a helper for loading a local [TiddlyWiki](https://tiddlywiki.com) file and storing it back to the same local file.

This is version 2. [Version 1](../) is still available.

## Features

- Works with any single-file TiddlyWiki instance. No plugins required!
- Works with anything compatible with TidlyWiki's [PUT saver](https://tiddlywiki.com/#Saving%20via%20WebDAV) (i.e. [Feather Wiki](https://feather.wiki/) also works)
- Each stored wiki has a url and can be bookmarked in the browser
- Works offline
- Widespread browser support on mobile and desktop. Uses browser features supported by all major browsers since 2023.

Try it at https://btheado.github.io/tiddlystow/sw-saver.

## How it works
Tiddlystow v2 is implemented as a service worker. It loads and saves local TiddlyWiki files by intercepting HTTP GET and PUT calls.

The service worker's HTTP PUT support will be automatically discovered and used by TiddlyWiki files for saving. The service
worker will save files PUT by the TiddlyWiki saver and then later load these files when fetched by the browser (GET).

Since it works at the HTTP layer, it is "invisible" to the TiddlyWiki files and should work with any TiddlyWiki single file instance.

Two flavors of local file saving are supported

- [Browser external files](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system#working_with_files_using_the_file_system_access_api) - only supported by Chrome and Edge desktop browsers
- [Browser internal files](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system#how_does_the_opfs_solve_such_problems) (OPFS) - supported by all major browsers
