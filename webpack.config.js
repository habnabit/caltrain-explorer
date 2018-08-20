const HtmlWebpackPlugin = require("html-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const WebpackPwaManifest = require("webpack-pwa-manifest");
const SWPrecacheWebpackPlugin = require('sw-precache-webpack-plugin');
const path = require("path");

const title = "🚂 It's Caltrain ✨"

module.exports = {
  mode: "production",
  entry: "./src/index.tsx",
  output: {
    filename: "site-[hash].js",
    path: path.resolve("dist"),
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".json"],
  },
  devtool: "source-map",
  module: {
    rules: [{
      test: /\.sass$/,
      use: [
        MiniCssExtractPlugin.loader,
        {
          loader: "css-loader",
          options: {
            sourceMap: true,
          },
        }, {
          loader: "sass-loader",
          options: {
            sourceMap: true,
          },
        }
      ],
    }, {
      test: /\.tsx?$/,
      exclude: /node_modules/,
      loader: "ts-loader",
    }],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: "site-[hash].css",
    }),
    new HtmlWebpackPlugin({
      inlineSource: ".(js|css)$",
      meta: {
        "viewport": "width=device-width, initial-scale=1, maximum-scale=1",
      },
      title: title,
    }),
    new WebpackPwaManifest({
      name: title,
      short_name: "Caltrain",
      description: "The Caltrain you always wanted",
      background_color: "#ffffff",
      ios: true,
      icons: [
        {
          src: path.resolve("icon.png"),
          sizes: [96, 128, 192, 256, 384, 512],
          ios: true,
        },
        {
          src: path.resolve("icon.png"),
          size: 512,
          ios: 'startup',
        },
      ],
    }),
    new SWPrecacheWebpackPlugin({
      cacheId: 'its-caltrain',
      dontCacheBustUrlsMatching: /\.\w{8}\./,
      filename: 'service-worker.js',
      minify: true,
      staticFileGlobsIgnorePatterns: [/\.map$/, /manifest\.json$/]
    }),
  ],
};
