const mongoose = require('mongoose')

const documentContentSchema = new mongoose.Schema(
{

    _id:{
        type:String,
        required:true,
        alias:'documentId'
    },

    content: {
      type: mongoose.Schema.Types.Mixed,
      default: '',
    },

},
 {

    timestamps: true,

    versionKey: false,
  }

)

const DocumentContent = mongoose.model(
  'DocumentContent',
  documentContentSchema
);

module.exports = DocumentContent;