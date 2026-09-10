import Foundation
import Darwin
let args = CommandLine.arguments
guard args.count == 4 else { exit(2) }
let url = URL(fileURLWithPath: args[1])
var info = stat()
guard lstat(args[1], &info) == 0, String(info.st_dev) == args[2], String(info.st_ino) == args[3], (info.st_mode & S_IFMT) != S_IFLNK else { fputs("File identity changed\n", stderr); exit(3) }
do { try FileManager.default.trashItem(at: url, resultingItemURL: nil) }
catch { fputs("\(error.localizedDescription)\n", stderr); exit(1) }
